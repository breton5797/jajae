import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClientSelectionPicker } from "@/components/client-selection-picker";
import { loadClientProjectDetail } from "@/lib/data/client-portal";
import { DELIVERY_STATUS_LABEL, deliveryVariant } from "@/lib/labels";
import type { ClientSelectionOption, DeliveryStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ClientProjectPage({
  params,
}: {
  params: { siteId: string };
}) {
  const { found, project, selections, deliveries } =
    await loadClientProjectDetail(params.siteId);

  if (!found || !project) {
    return (
      <Card>
        <CardContent className="space-y-3 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            접근할 수 없는 현장이거나 초대가 만료되었습니다.
          </p>
          <Button variant="outline" asChild>
            <Link href="/client">내 현장</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <Link href="/client" className="text-sm text-muted-foreground hover:text-brand">
          ← 내 현장
        </Link>
        <h1 className="text-xl font-bold">{project.name}</h1>
        {project.address && (
          <p className="text-sm text-muted-foreground">{project.address}</p>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>배송 진행상황</CardTitle>
        </CardHeader>
        <CardContent>
          {deliveries.length === 0 ? (
            <p className="text-sm text-muted-foreground">예정된 배송이 없습니다.</p>
          ) : (
            <ul className="space-y-2">
              {deliveries.map((d) => (
                <li key={d.id} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{d.scheduled_date}</span>
                  <Badge variant={deliveryVariant(d.status as DeliveryStatus)}>
                    {DELIVERY_STATUS_LABEL[d.status as DeliveryStatus]}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {selections.map((sel) => (
        <Card key={sel.id}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2 text-base">
              {sel.title}
              <Badge variant={sel.status === "chosen" ? "success" : "neutral"}>
                {sel.status === "chosen" ? "선택완료" : sel.status === "declined" ? "선택안함" : "선택대기"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ClientSelectionPicker
              selectionId={sel.id}
              options={sel.option_set as ClientSelectionOption[]}
              chosen={sel.chosen}
              status={sel.status}
            />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
