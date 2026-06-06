import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ReferralPanel } from "@/components/referral-panel";
import { loadReferralOverview } from "@/lib/data/referral";
import { formatKRW } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  invited: "초대됨",
  joined: "가입완료",
  rewarded: "적립완료",
  void: "취소",
};

export default async function ReferralPage() {
  const r = await loadReferralOverview();

  if (!r.authed) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>친구 추천</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            로그인 후 동료 시공사를 추천하고 적립금을 받으세요.
          </p>
          <Button asChild>
            <Link href="/login">로그인</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const existingCode = r.referrals.find((x) => x.status === "invited")?.code;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">친구 추천</h1>
        <p className="text-sm text-muted-foreground">
          동료 시공사를 초대하면, 첫 주문 시 적립금이 정산에 반영됩니다.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">누적 적립금</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-brand">{formatKRW(r.totalReward)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">추천 성공</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{r.rewardedCount}명</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>내 초대 코드</CardTitle>
        </CardHeader>
        <CardContent>
          <ReferralPanel existingCode={existingCode} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>추천 현황</CardTitle>
        </CardHeader>
        <CardContent>
          {r.referrals.length === 0 ? (
            <p className="text-sm text-muted-foreground">아직 추천 내역이 없습니다.</p>
          ) : (
            <ul className="divide-y">
              {r.referrals.map((ref) => (
                <li key={ref.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="font-mono text-xs">{ref.code}</span>
                  <span>{ref.reward > 0 ? formatKRW(ref.reward) : "-"}</span>
                  <Badge variant={ref.status === "rewarded" ? "success" : "neutral"}>
                    {STATUS_LABEL[ref.status] ?? ref.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
