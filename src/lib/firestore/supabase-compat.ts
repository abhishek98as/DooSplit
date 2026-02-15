import "server-only";
import {
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firestore/admin";
import { newAppId } from "@/lib/ids";

type AnyRow = Record<string, any>;

type CountOption = "exact" | null;

interface SelectOptions {
  count?: CountOption;
  head?: boolean;
}

interface QueryResult<T = any> {
  data: T;
  error: { message: string } | null;
  count?: number | null;
}

type FilterOperator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "ilike"
  | "in"
  | "is";

interface FilterCondition {
  field: string;
  op: FilterOperator;
  value: any;
}

function toComparable(value: any): any {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "object" && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }

  return value;
}

function normalizeDoc(doc: QueryDocumentSnapshot<DocumentData>): AnyRow {
  const data = doc.data() || {};
  return {
    id: data.id || doc.id,
    ...data,
  };
}

function parseColumns(columns?: string): string[] | null {
  if (!columns || columns.trim() === "*") {
    return null;
  }

  return columns
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.split(":")[0].trim());
}

function projectRow(row: AnyRow, columns: string[] | null): AnyRow {
  if (!columns) {
    return row;
  }

  const next: AnyRow = {};
  for (const column of columns) {
    next[column] = row[column];
  }

  if (next.id === undefined && row.id !== undefined) {
    next.id = row.id;
  }

  return next;
}

function evaluateCondition(row: AnyRow, condition: FilterCondition): boolean {
  const left = toComparable(row[condition.field]);
  const right = toComparable(condition.value);

  switch (condition.op) {
    case "eq":
      return left === right;
    case "neq":
      return left !== right;
    case "gt":
      return left > right;
    case "gte":
      return left >= right;
    case "lt":
      return left < right;
    case "lte":
      return left <= right;
    case "in":
      return Array.isArray(right) ? right.includes(left) : false;
    case "ilike": {
      const haystack = String(left || "").toLowerCase();
      const pattern = String(right || "").toLowerCase();
      const normalized = pattern.replace(/%/g, "");
      return haystack.includes(normalized);
    }
    case "is":
      return left === right;
    default:
      return false;
  }
}

function splitTopLevel(input: string, separator = ","): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";

  for (const char of input) {
    if (char === "(") {
      depth += 1;
      current += char;
      continue;
    }

    if (char === ")") {
      depth -= 1;
      current += char;
      continue;
    }

    if (char === separator && depth === 0) {
      if (current.trim()) {
        parts.push(current.trim());
      }
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

function parseSimpleCondition(raw: string): FilterCondition | null {
  const match = raw.match(/^([A-Za-z0-9_]+)\.(eq|neq|gt|gte|lt|lte|ilike)\.(.+)$/);
  if (!match) {
    return null;
  }

  const [, field, op, value] = match;
  return {
    field,
    op: op as FilterOperator,
    value,
  };
}

function parseOrExpression(expression: string): Array<(row: AnyRow) => boolean> {
  const terms = splitTopLevel(expression, ",");

  return terms
    .map((term) => term.trim())
    .filter(Boolean)
    .map<(row: AnyRow) => boolean>((term) => {
      if (term.startsWith("and(") && term.endsWith(")")) {
        const inner = term.slice(4, -1);
        const innerParts = splitTopLevel(inner, ",")
          .map((segment) => parseSimpleCondition(segment))
          .filter((segment): segment is FilterCondition => segment !== null);

        return (row: AnyRow) => innerParts.every((condition) => evaluateCondition(row, condition));
      }

      const condition = parseSimpleCondition(term);
      if (!condition) {
        return () => false;
      }

      return (row: AnyRow) => evaluateCondition(row, condition);
    });
}

class FirestoreQueryBuilder {
  private readonly table: string;
  private selectedColumns: string[] | null = null;
  private selectOptions: SelectOptions = {};
  private filters: FilterCondition[] = [];
  private orPredicates: Array<(row: AnyRow) => boolean> = [];
  private orderByClauses: Array<{ field: string; ascending: boolean }> = [];
  private limitValue: number | null = null;
  private rangeValue: { from: number; to: number } | null = null;

  private action: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private mutationPayload: AnyRow[] = [];
  private onConflictField: string | null = null;

  constructor(table: string) {
    this.table = table;
  }

  select(columns = "*", options: SelectOptions = {}) {
    this.selectedColumns = parseColumns(columns);
    this.selectOptions = options;
    return this;
  }

  eq(field: string, value: any) {
    this.filters.push({ field, op: "eq", value });
    return this;
  }

  neq(field: string, value: any) {
    this.filters.push({ field, op: "neq", value });
    return this;
  }

  gt(field: string, value: any) {
    this.filters.push({ field, op: "gt", value });
    return this;
  }

  gte(field: string, value: any) {
    this.filters.push({ field, op: "gte", value });
    return this;
  }

  lt(field: string, value: any) {
    this.filters.push({ field, op: "lt", value });
    return this;
  }

  lte(field: string, value: any) {
    this.filters.push({ field, op: "lte", value });
    return this;
  }

  ilike(field: string, value: any) {
    this.filters.push({ field, op: "ilike", value });
    return this;
  }

  in(field: string, values: any[]) {
    this.filters.push({ field, op: "in", value: values });
    return this;
  }

  is(field: string, value: any) {
    this.filters.push({ field, op: "is", value });
    return this;
  }

  or(expression: string) {
    const predicates = parseOrExpression(expression);
    this.orPredicates.push(...predicates);
    return this;
  }

  order(field: string, options: { ascending?: boolean } = {}) {
    this.orderByClauses.push({ field, ascending: options.ascending !== false });
    return this;
  }

  limit(value: number) {
    this.limitValue = value;
    return this;
  }

  range(from: number, to: number) {
    this.rangeValue = { from, to };
    return this;
  }

  insert(payload: AnyRow | AnyRow[]) {
    this.action = "insert";
    this.mutationPayload = Array.isArray(payload) ? payload : [payload];
    return this;
  }

  update(payload: AnyRow) {
    this.action = "update";
    this.mutationPayload = [payload];
    return this;
  }

  delete() {
    this.action = "delete";
    this.mutationPayload = [];
    return this;
  }

  upsert(payload: AnyRow | AnyRow[], options: { onConflict?: string } = {}) {
    this.action = "upsert";
    this.mutationPayload = Array.isArray(payload) ? payload : [payload];
    this.onConflictField = options.onConflict || null;
    return this;
  }

  async single() {
    const result = await this.execute();
    if (result.error) {
      return result;
    }

    const rows = (result.data || []) as AnyRow[];
    if (rows.length !== 1) {
      return {
        data: null,
        error: { message: rows.length === 0 ? "No rows found" : "Multiple rows found" },
      };
    }

    return {
      ...result,
      data: rows[0],
    };
  }

  async maybeSingle() {
    const result = await this.execute();
    if (result.error) {
      return result;
    }

    const rows = (result.data || []) as AnyRow[];
    if (rows.length === 0) {
      return {
        ...result,
        data: null,
      };
    }

    return {
      ...result,
      data: rows[0],
    };
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled as any, onrejected as any);
  }

  private async fetchRows(): Promise<AnyRow[]> {
    const db = getAdminDb();
    const snapshot = await db.collection(this.table).get();
    return snapshot.docs.map((doc) => normalizeDoc(doc));
  }

  private applyFilters(rows: AnyRow[]): AnyRow[] {
    let next = rows.filter((row) => this.filters.every((condition) => evaluateCondition(row, condition)));

    if (this.orPredicates.length > 0) {
      next = next.filter((row) => this.orPredicates.some((predicate) => predicate(row)));
    }

    for (const clause of this.orderByClauses) {
      next = [...next].sort((a, b) => {
        const left = toComparable(a[clause.field]);
        const right = toComparable(b[clause.field]);

        if (left === right) {
          return 0;
        }

        if (left === undefined || left === null) {
          return clause.ascending ? 1 : -1;
        }

        if (right === undefined || right === null) {
          return clause.ascending ? -1 : 1;
        }

        if (left > right) {
          return clause.ascending ? 1 : -1;
        }

        return clause.ascending ? -1 : 1;
      });
    }

    if (this.rangeValue) {
      next = next.slice(this.rangeValue.from, this.rangeValue.to + 1);
    }

    if (this.limitValue !== null) {
      next = next.slice(0, this.limitValue);
    }

    return next;
  }

  private applyProjection(rows: AnyRow[]): AnyRow[] {
    return rows.map((row) => projectRow(row, this.selectedColumns));
  }

  private async executeSelect(): Promise<QueryResult<any[] | null>> {
    const rows = this.applyFilters(await this.fetchRows());
    const projected = this.applyProjection(rows);

    if (this.selectOptions.head) {
      return {
        data: null,
        error: null,
        count: this.selectOptions.count === "exact" ? rows.length : null,
      };
    }

    return {
      data: projected,
      error: null,
      count: this.selectOptions.count === "exact" ? rows.length : null,
    };
  }

  private async executeInsert(): Promise<QueryResult<any[]>> {
    const db = getAdminDb();
    const collection = db.collection(this.table);
    const inserted: AnyRow[] = [];

    for (const payload of this.mutationPayload) {
      const id = String(payload.id || newAppId());
      const row = {
        ...payload,
        id,
      };

      await collection.doc(id).set(row, { merge: false });
      inserted.push(row);
    }

    return {
      data: this.applyProjection(inserted),
      error: null,
    };
  }

  private async executeUpdate(): Promise<QueryResult<any[]>> {
    const db = getAdminDb();
    const collection = db.collection(this.table);
    const rows = this.applyFilters(await this.fetchRows());
    const patch = this.mutationPayload[0] || {};

    for (const row of rows) {
      const id = String(row.id);
      await collection.doc(id).set(
        {
          ...patch,
          id,
        },
        { merge: true }
      );
    }

    const updated = rows.map((row) => ({ ...row, ...patch }));
    return {
      data: this.applyProjection(updated),
      error: null,
    };
  }

  private async executeDelete(): Promise<QueryResult<any[]>> {
    const db = getAdminDb();
    const collection = db.collection(this.table);
    const rows = this.applyFilters(await this.fetchRows());

    for (const row of rows) {
      const id = String(row.id);
      await collection.doc(id).delete();
    }

    return {
      data: this.applyProjection(rows),
      error: null,
    };
  }

  private async executeUpsert(): Promise<QueryResult<any[]>> {
    const db = getAdminDb();
    const collection = db.collection(this.table);
    const results: AnyRow[] = [];

    for (const payload of this.mutationPayload) {
      let existingId: string | null = null;

      if (this.onConflictField && payload[this.onConflictField] !== undefined) {
        const existing = await collection
          .where(this.onConflictField, "==", payload[this.onConflictField])
          .limit(1)
          .get();
        if (!existing.empty) {
          existingId = existing.docs[0].id;
        }
      }

      const id = String(payload.id || existingId || newAppId());
      const row = {
        ...payload,
        id,
      };

      await collection.doc(id).set(row, { merge: true });
      results.push(row);
    }

    return {
      data: this.applyProjection(results),
      error: null,
    };
  }

  private async execute(): Promise<QueryResult<any>> {
    try {
      switch (this.action) {
        case "insert":
          return this.executeInsert();
        case "update":
          return this.executeUpdate();
        case "delete":
          return this.executeDelete();
        case "upsert":
          return this.executeUpsert();
        default:
          return this.executeSelect();
      }
    } catch (error: any) {
      return {
        data: null,
        error: {
          message: error?.message || "Query failed",
        },
      };
    }
  }
}

class FirestoreCompatClient {
  public auth = {
    admin: {
      createUser: async (input: {
        email: string;
        password: string;
        email_confirm?: boolean;
        user_metadata?: Record<string, any>;
      }) => {
        try {
          const auth = getAdminAuth();
          const created = await auth.createUser({
            email: input.email,
            password: input.password,
            emailVerified: Boolean(input.email_confirm),
            displayName: input.user_metadata?.name || undefined,
          });

          return {
            data: {
              user: {
                id: created.uid,
                email: created.email,
              },
            },
            error: null,
          };
        } catch (error: any) {
          return {
            data: { user: null },
            error: { message: error?.message || "Failed to create user" },
          };
        }
      },
    },
  };

  from(table: string) {
    return new FirestoreQueryBuilder(table);
  }
}

let cachedClient: FirestoreCompatClient | null = null;

export function getFirestoreCompatClient() {
  if (!cachedClient) {
    cachedClient = new FirestoreCompatClient();
  }

  return cachedClient;
}

export type FirestoreCompat = FirestoreCompatClient;
