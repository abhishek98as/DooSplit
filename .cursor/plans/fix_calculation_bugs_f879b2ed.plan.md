---
name: Fix Calculation Bugs
overview: Comprehensive analysis of DooSplit's calculation pipeline reveals 4 critical bugs (settlement sign inversion, settlement direction hardcoded, inconsistent balance algorithms, and broken offline recalculator) plus several significant issues and design gaps compared to Splitwise.
todos:
  - id: fix-settlement-signs
    content: Fix settlement sign inversion in all 4 balance computation locations (friend detail route, computePairwiseBalancesForUser, computeGroupMemberNetBalances, recalculateFriendBalance)
    status: done
  - id: fix-settlement-direction
    content: Fix settlement direction in settlements/page.tsx to determine fromUserId/toUserId based on who actually owes whom
    status: done
  - id: unify-balance-algorithm
    content: Replace naive friend-net approach in friend detail route with transfer-based algorithm from balance-service.ts
    status: done
  - id: fix-offline-recalculator
    content: Wire up getCurrentUserId with auth, port transfer-based algorithm, fix settlement signs in balance-recalculator.ts
    status: done
  - id: fix-group-breakdown
    content: Include settlements in group balance breakdown in friend detail route
    status: done
  - id: fix-client-side-splits
    content: Compute correct owedAmount on client side in add/edit expense pages for accurate previews and offline storage
    status: done
  - id: cleanup-dead-code
    content: Remove or properly implement balanceCalculator.ts stub, deduplicate round2/toNum/chunk utilities
    status: done
  - id: handle-historical-data
    content: Assess whether existing settlement records need migration due to wrong from/to direction, add compatibility if needed
    status: done
isProject: false
---

# DooSplit Calculation Bug Analysis and Fix Plan

## Root Cause Analysis

After tracing the entire calculation pipeline -- from expense creation through split calculation, balance computation, settlement processing, and display -- I identified **4 critical bugs**, **4 significant bugs**, and **5 design limitations** compared to Splitwise.

---

## CRITICAL BUG 1: Settlement Sign Inversion (Balance Doubles Instead of Settling)

**The single most damaging bug in the app.** The settlement effect on balances is **backwards** in every balance computation path.

**Affected files:**

- [src/app/api/friends/[id]/route.ts](src/app/api/friends/[id]/route.ts) (lines 178-184)
- [src/lib/data/balance-service.ts](src/lib/data/balance-service.ts) - `computePairwiseBalancesForUser` (lines 200-208)
- [src/lib/data/balance-service.ts](src/lib/data/balance-service.ts) - `computeGroupMemberNetBalances` (lines 263-268)
- [src/lib/balance-recalculator.ts](src/lib/balance-recalculator.ts) - `recalculateFriendBalance` (lines 129-138)

**How it manifests:**

The sign convention across the app is: **positive balance = friend owes you**, **negative balance = you owe friend**.

A settlement "from A to B" means "A physically paid B". When user pays friend, user's debt should decrease (balance moves toward zero). But the code does the opposite:

```
// CURRENT (WRONG) - friend detail route
if (settlement.from_user_id === userId) {
  balance -= amount;  // Should be +=
} else {
  balance += amount;  // Should be -=
}
```

**Proof by example:**

- User owes friend $100 (balance = -100)
- User records settlement of $100 (user pays friend)
- Code: balance = -100 - 100 = **-200** (WRONG, debt doubled!)
- Correct: balance = -100 + 100 = **0** (debt cleared)

This bug is **partially masked** by Critical Bug 2 (settlement always from=user), which causes the two bugs to cancel out when the **friend owes you**. But when **you owe a friend** and record a settlement, the debt doubles.

**Fix:** Invert the settlement signs in all 4 locations:

- `from === user` -> `balance += amount` (user paid, their perspective improves)
- `from === friend` -> `balance -= amount` (friend paid, their debt decreases)

---

## CRITICAL BUG 2: Settlement Direction Always "You Paid Friend"

**Affected file:** [src/app/settlements/page.tsx](src/app/settlements/page.tsx) (line 181)

```javascript
body: JSON.stringify({
  fromUserId: session?.user?.id,  // ALWAYS the current user
  toUserId: selectedFriend,
  amount: parseFloat(amount),
})
```

The settlement UI always records `fromUserId = currentUser`, regardless of who actually owes whom. Combined with Bug 1, this means:

- **Friend owes you $100, you record settlement:** from=you, to=friend. Balance = 100 - 100 = 0. Appears correct (two wrongs cancel out).
- **You owe friend $100, you record settlement:** from=you, to=friend. Balance = -100 - 100 = -200. **Completely wrong.**

**Fix:** Determine settlement direction based on the balance:

- If `balance < 0` (user owes friend): `fromUserId = user, toUserId = friend`
- If `balance > 0` (friend owes user): `fromUserId = friend, toUserId = user`

Both Bug 1 and Bug 2 must be fixed together. Fixing only one would break the scenario that currently works by accident.

---

## CRITICAL BUG 3: Inconsistent Balance Algorithms (Friend List vs Friend Detail Show Different Numbers)

**Affected files:**

- [src/lib/data/balance-service.ts](src/lib/data/balance-service.ts) - used by the **Friends LIST** page
- [src/app/api/friends/[id]/route.ts](src/app/api/friends/[id]/route.ts) - used by the **Friend DETAIL** page

The **Friends LIST** uses a transfer-based algorithm (`buildTransfersForExpense` with greedy debtor-creditor matching), while the **Friend DETAIL** uses a naive "friend-net" approach that only looks at the friend's individual `paid - owed`:

```javascript
// Friend DETAIL (naive approach)
const friendNet = paid_amount - owed_amount;
balance -= friendNet;
```

These give **different results for 3+ person expenses**. Example:

- $300 expense. A pays $100, B pays $200. Split equally ($100 each).
- **Friend LIST** (transfer-based): From A's view, B balance = 0, C balance = 0 (correct: only transfer is C->B)
- **Friend DETAIL** (naive): From A's view, B balance = -100 (WRONG: says A owes B $100)

Users see one balance on the friends list, then a **different balance** when they tap into friend details.

**Fix:** Unify on the transfer-based algorithm from `balance-service.ts`. Either call `computePairwiseBalancesForUser` in the friend detail route, or refactor `buildTransfersForExpense` into a shared utility.

---

## CRITICAL BUG 4: Offline Balance Recalculator is Completely Broken

**Affected file:** [src/lib/balance-recalculator.ts](src/lib/balance-recalculator.ts) (lines 298-303)

```javascript
async function getCurrentUserId(): Promise<string | null> {
  console.warn('getCurrentUserId() not implemented');
  return null;  // ALWAYS returns null
}
```

The main entry point `recalculateBalances()` calls `getCurrentUserId()` which always returns `null`, causing the function to throw `"No current user found"`. **Offline balance recalculation never works.**

Additionally, even if `getCurrentUserId` were fixed, the recalculator uses the same naive friend-net approach (Bug 3) and inverted settlement signs (Bug 1).

**Fix:**

- Integrate `getCurrentUserId` with the auth system (read from `localStorage` via `getCurrentUserIdFromStorage()` which already exists at line 316)
- Port the transfer-based balance algorithm
- Fix settlement signs

---

## SIGNIFICANT BUGS

### Bug 5: Group Balance Breakdown Ignores Settlements

In [src/app/api/friends/[id]/route.ts](src/app/api/friends/[id]/route.ts) (lines 218-247), the per-group balance breakdown is computed from expenses only. Settlements with `group_id` are NOT subtracted. The overall balance includes settlements, but individual group breakdowns don't, causing them to not add up.

### Bug 6: `balanceCalculator.ts` is Dead Stub Code

[src/lib/balanceCalculator.ts](src/lib/balanceCalculator.ts) has all functions returning 0/empty. It's not imported anywhere currently, but its existence is confusing and a maintenance trap.

### Bug 7: Client-Side Split Sends Zero Owed Amounts

In [src/app/expenses/add/page.tsx](src/app/expenses/add/page.tsx) (line 163), `owedAmount: 0` is sent for all participants. The backend recalculates, but if the expense is stored offline first, IndexedDB contains zero owed amounts, making offline balance calculations wrong.

### Bug 8: Edit Page Incorrect Split for Payer

In [src/app/expenses/edit/[id]/page.tsx](src/app/expenses/edit/[id]/page.tsx) (line 218), `owedAmount: 0` is set for the payer in equal splits. The payer still owes their share -- they paid the full amount but only owe their portion. This means the client-side preview shows wrong amounts (backend recalculates correctly on save).

---

## Design Limitations vs Splitwise

### Limitation 1: No Multi-Payer Support

All split functions assume a single payer (`paidAmount: isPayer ? amount : 0`). Splitwise allows multiple people to contribute to a single expense.

### Limitation 2: Greedy Debt Simplification (Not Optimal)

The `simplifyFromNet` function uses a greedy algorithm that matches largest debtor to largest creditor. This doesn't always minimize the number of transactions. Splitwise uses a min-cost flow / subset-sum approach for optimal results.

### Limitation 3: No Partial Settlement Auto-Direction

Splitwise automatically determines settlement direction and pre-fills the correct amount. DooSplit shows `Math.abs(balance)` and always records from=currentUser.

### Limitation 4: Duplicate Utility Functions

`round2`, `toNum`, `uniqueStrings`, `chunk` are copy-pasted across 4+ files instead of being imported from a shared module.

### Limitation 5: No Negative Amount Validation on Client

Amount inputs accept negative numbers on the client side (only `type="number"` without `min="0.01"`). Server validates `amount > 0` but client doesn't.

---

## Feasibility Assessment


| Issue                                | Difficulty | Risk                                                            | Feasibility                                          |
| ------------------------------------ | ---------- | --------------------------------------------------------------- | ---------------------------------------------------- |
| Bug 1: Settlement sign inversion     | Low        | Medium (needs data migration if existing settlements are wrong) | High - straightforward sign flip in 4 files          |
| Bug 2: Settlement direction          | Low        | Low                                                             | High - add direction logic to settlements page       |
| Bug 3: Inconsistent algorithms       | Medium     | Low                                                             | High - reuse existing transfer algorithm             |
| Bug 4: Offline recalculator          | Medium     | Low                                                             | High - wire up existing auth + port algorithm        |
| Bug 5: Group breakdown settlements   | Low        | Low                                                             | High - add settlement query to breakdown loop        |
| Bug 7-8: Client-side split           | Low        | Low                                                             | High - compute correct owed amounts client-side      |
| Limitation 1: Multi-payer            | High       | Medium                                                          | Medium - requires schema changes and UI redesign     |
| Limitation 2: Optimal simplification | Medium     | Low                                                             | Medium - algorithm replacement, well-studied problem |


**Key risk:** Existing settlement records in Firestore may have been created with the wrong `from/to` direction. A data migration or compatibility layer may be needed to handle historical data after fixing Bug 2.

---

## Recommended Fix Order

1. Fix settlement signs (Bug 1) + settlement direction (Bug 2) together -- these are interdependent
2. Unify balance algorithms (Bug 3) -- eliminates the visible inconsistency
3. Fix offline recalculator (Bug 4) -- enables offline mode
4. Fix group breakdown (Bug 5), client-side splits (Bug 7-8), cleanup stubs (Bug 6)
5. Address design limitations as separate feature work

