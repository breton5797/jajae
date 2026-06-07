import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "자재 Open API — Reference" };

interface Endpoint {
  method: string;
  path: string;
  scope: string;
  desc: string;
}

const ENDPOINTS: Endpoint[] = [
  { method: "GET", path: "/api/v1/products", scope: "products:read", desc: "List approved products (catalog)." },
  { method: "GET", path: "/api/v1/pos", scope: "pos:read", desc: "Pull purchase orders assigned to your supplier (supports ?since=ISO)." },
  { method: "POST", path: "/api/v1/inventory", scope: "inventory:write", desc: "Push stock/price for a product. Idempotent by `version`." },
];

const EVENTS = ["order.created", "po.fulfilled", "settlement.closed"];

export default function ApiDocsPage() {
  return (
    <div className="space-y-4">
      <div>
        <Link href="/partner" className="text-sm text-muted-foreground hover:text-brand">
          ← Partner Console
        </Link>
        <h1 className="text-xl font-bold">자재 Open API — Reference</h1>
        <p className="text-sm text-muted-foreground">
          REST over HTTPS. Authenticate with <code>x-api-key</code>. Rate-limited per client.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Authentication</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>Send your API key in the header:</p>
          <pre className="overflow-x-auto rounded-md bg-neutral-900 p-3 text-xs text-neutral-100">
{`curl https://<host>/api/v1/products \\
  -H "x-api-key: jck_live_xxx"`}
          </pre>
          <p className="text-muted-foreground">
            Keys are shown once at creation. Requests are rate-limited (HTTP 429) and logged.
            Missing/insufficient scope returns 401/403.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Endpoints</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {ENDPOINTS.map((e) => (
              <li key={e.path + e.method} className="py-2">
                <div className="flex items-center gap-2 text-sm">
                  <Badge variant={e.method === "GET" ? "neutral" : "default"}>{e.method}</Badge>
                  <code className="font-mono">{e.path}</code>
                  <Badge variant="outline" className="ml-auto text-[10px]">{e.scope}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{e.desc}</p>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Webhooks</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            Events are POSTed to your URL with an <code>X-Jajae-Signature</code> HMAC-SHA256
            of the raw body using your webhook secret. Verify before trusting. Failed
            deliveries retry with exponential backoff (max 5 attempts, then dead-letter).
          </p>
          <div className="flex flex-wrap gap-2">
            {EVENTS.map((ev) => (
              <Badge key={ev} variant="neutral">{ev}</Badge>
            ))}
          </div>
          <pre className="overflow-x-auto rounded-md bg-neutral-900 p-3 text-xs text-neutral-100">
{`signature = HMAC_SHA256(secret, raw_request_body)
// compare in constant time against X-Jajae-Signature`}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
