import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HubCreateForm, HubInventoryForm } from "@/components/hub-controls";
import { loadHubs } from "@/lib/data/hubs";

export const dynamic = "force-dynamic";

export default async function AdminHubsPage() {
  const { hubs, inventory } = await loadHubs();
  const invByHub = new Map<string, number>();
  for (const i of inventory) {
    invByHub.set(i.hub_id, (invByHub.get(i.hub_id) ?? 0) + i.qty);
  }

  return (
    <div className="space-y-4">
      <div>
        <Link href="/admin" className="text-sm text-muted-foreground hover:text-brand">
          ← 운영 콘솔
        </Link>
        <h1 className="text-xl font-bold">물류 허브</h1>
        <p className="text-sm text-muted-foreground">
          허브 재고로 당일 출고를, 부족 시 공급사 직배송으로 자동 라우팅합니다.
        </p>
      </div>

      <HubCreateForm />
      <HubInventoryForm hubs={hubs} />

      <Card>
        <CardHeader>
          <CardTitle>허브 ({hubs.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {hubs.length === 0 ? (
            <p className="text-sm text-muted-foreground">등록된 허브가 없습니다.</p>
          ) : (
            <ul className="divide-y text-sm">
              {hubs.map((h) => (
                <li key={h.id} className="flex items-center justify-between py-2">
                  <div>
                    <p className="font-medium">{h.name}</p>
                    <p className="text-xs text-muted-foreground">{h.location}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    총 재고 {invByHub.get(h.id) ?? 0}
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
