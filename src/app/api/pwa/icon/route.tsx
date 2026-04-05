import { ImageResponse } from "next/og";

export const runtime = "edge";

const DEFAULT_SIZE = 192;
const ALLOWED_SIZES = new Set([32, 72, 96, 128, 144, 152, 180, 192, 384, 512]);

function resolveSize(value: string | null): number {
  const parsed = Number.parseInt(value || "", 10);

  if (ALLOWED_SIZES.has(parsed)) {
    return parsed;
  }

  return DEFAULT_SIZE;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const size = resolveSize(searchParams.get("size"));
  const outerRadius = Math.round(size * 0.26);
  const cardRadius = Math.round(size * 0.18);
  const dotSize = Math.max(10, Math.round(size * 0.12));
  const dividerWidth = Math.max(4, Math.round(size * 0.03));

  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "linear-gradient(135deg, rgb(0, 184, 169) 0%, rgb(0, 132, 255) 100%)",
          borderRadius: outerRadius,
        }}
      >
        <div
          style={{
            width: Math.round(size * 0.66),
            height: Math.round(size * 0.66),
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: Math.round(size * 0.11),
            borderRadius: cardRadius,
            background: "rgba(255,255,255,0.96)",
            boxShadow: "0 18px 45px rgba(15, 23, 42, 0.22)",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: Math.round(size * 0.04),
            }}
          >
            <div
              style={{
                width: dotSize,
                height: dotSize,
                borderRadius: dotSize,
                background: "rgb(0, 184, 169)",
              }}
            />
            <div
              style={{
                width: Math.round(size * 0.13),
                height: Math.round(size * 0.16),
                borderRadius: Math.round(size * 0.08),
                background: "rgba(0, 184, 169, 0.16)",
              }}
            />
          </div>

          <div
            style={{
              width: dividerWidth,
              height: Math.round(size * 0.22),
              borderRadius: dividerWidth,
              background: "rgba(15, 23, 42, 0.16)",
            }}
          />

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: Math.round(size * 0.04),
            }}
          >
            <div
              style={{
                width: dotSize,
                height: dotSize,
                borderRadius: dotSize,
                background: "rgb(0, 132, 255)",
              }}
            />
            <div
              style={{
                width: Math.round(size * 0.13),
                height: Math.round(size * 0.16),
                borderRadius: Math.round(size * 0.08),
                background: "rgba(0, 132, 255, 0.16)",
              }}
            />
          </div>
        </div>
      </div>
    ),
    {
      width: size,
      height: size,
    }
  );
}
