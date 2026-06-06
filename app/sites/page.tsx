import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BudgetBar } from "@/components/budget-bar";
import { SiteCreateForm } from "@/components/site-create-form";
import { loadSitesWithBudget } from "@/lib/data/projects";

export const dynamic = "force-dynamic";

export default async function SitesPage() {
  const { authed, sites } = await loadSitesWithBudget();

  if (!authed) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>현장 관리</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            로그인 후 현장(現場)을 등록하고 예산·일정을 관리할 수 있습니다.
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
      <div>
        <h1 className="text-xl font-bold">현장 관리</h1>
        <p className="text-sm text-muted-foreground">
          현장별 예산 대비 지출과 일정을 한눈에 관리하세요.
        </p>
      </div>

      <SiteCreateForm />

      <div className="space-y-3">
        {sites.length === 0 && (
          <p className="text-sm text-muted-foreground">
            등록된 현장이 없습니다. 새 현장을 등록하세요.
          </p>
        )}
        {sites.map(({ site, budget }) => (
          <Link key={site.id} href={`/sites/${site.id}`}>
            <Card className="transition-colors hover:border-brand">
              <CardHeader>
                <CardTitle>{site.name}</CardTitle>
                {site.address && (
                  <p className="text-xs text-muted-foreground">{site.address}</p>
                )}
              </CardHeader>
              <CardContent>
                <BudgetBar budget={budget} />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
