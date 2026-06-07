import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ApiClientCreateForm, WebhookForm } from "@/components/partner-controls";
import { loadPartnerConsole } from "@/lib/data/partner";

export const dynamic = "force-dynamic";

export default async function PartnerPage() {
  const c = await loadPartnerConsole();

  if (!c.authed) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>개발자/파트너 콘솔</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            로그인 후 API 키 발급, 스코프 설정, 웹훅 구성, 사용 로그를 확인하세요.
          </p>
          <Button asChild>
            <Link href="/login">로그인</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-bold">개발자/파트너 콘솔</h1>
          <p className="text-sm text-muted-foreground">Open API · 웹훅 · ERP 연동</p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/api-docs">API 문서</Link>
        </Button>
      </div>

      <ApiClientCreateForm />

      <Card>
        <CardHeader>
          <CardTitle>API 클라이언트 ({c.clients.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {c.clients.length === 0 ? (
            <p className="text-sm text-muted-foreground">발급된 클라이언트가 없습니다.</p>
          ) : (
            <ul className="divide-y">
              {c.clients.map((cl) => (
                <li key={cl.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <p className="font-medium">{cl.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">{cl.key_prefix}…</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {cl.scopes.map((s) => (
                      <Badge key={s} variant="neutral" className="text-[10px]">
                        {s}
                      </Badge>
                    ))}
                    <Badge variant={cl.status === "active" ? "success" : "destructive"}>
                      {cl.status}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>웹훅</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <WebhookForm clients={c.clients} />
          {c.webhooks.length > 0 && (
            <ul className="divide-y text-sm">
              {c.webhooks.map((w) => (
                <li key={w.id} className="flex items-center justify-between py-2">
                  <Badge variant="neutral">{w.event}</Badge>
                  <span className="truncate font-mono text-xs text-muted-foreground">{w.url}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>최근 API 호출 ({c.recentLogs.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {c.recentLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">호출 기록이 없습니다.</p>
          ) : (
            <ul className="divide-y text-xs">
              {c.recentLogs.map((l) => (
                <li key={l.id} className="flex justify-between py-1.5">
                  <span className="font-mono">{l.method} {l.endpoint}</span>
                  <span className={l.status >= 400 ? "text-destructive" : "text-success"}>
                    {l.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
