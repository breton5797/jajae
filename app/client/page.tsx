import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { loadClientProjects } from "@/lib/data/client-portal";

export const dynamic = "force-dynamic";

export default async function ClientHomePage() {
  const { authed, projects } = await loadClientProjects();

  if (!authed) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>입주민 포털</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            초대받은 현장의 견적·자재선택·진행상황을 확인하려면 로그인하세요.
          </p>
          <Button asChild>
            <Link href="/client/login">입주민 로그인</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">내 현장</h1>
      {projects.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            초대받은 현장이 없습니다.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {projects.map((p) => (
            <Link key={p.siteId} href={`/client/${p.siteId}`}>
              <Card className="transition-colors hover:border-brand">
                <CardHeader>
                  <CardTitle>{p.name}</CardTitle>
                  {p.address && (
                    <p className="text-xs text-muted-foreground">{p.address}</p>
                  )}
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
