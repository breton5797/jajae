"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type BizResult = { ok: boolean; message: string };

export default function LoginPage() {
  const [kakaoError, setKakaoError] = useState<string | null>(null);
  const [kakaoLoading, setKakaoLoading] = useState(false);
  const [bizNo, setBizNo] = useState("");
  const [bizLoading, setBizLoading] = useState(false);
  const [bizResult, setBizResult] = useState<BizResult | null>(null);

  async function handleKakaoLogin() {
    setKakaoError(null);
    setKakaoLoading(true);
    try {
      const sb = createClient();
      const { error } = await sb.auth.signInWithOAuth({
        provider: "kakao",
        options: { redirectTo: window.location.origin + "/dashboard" },
      });
      if (error) throw new Error(error.message);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "로그인에 실패했습니다.";
      setKakaoError(msg);
      setKakaoLoading(false);
    }
  }

  async function handleBizVerify() {
    setBizResult(null);
    setBizLoading(true);
    try {
      const res = await fetch("/api/biz-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bizNo }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (data.ok) {
        setBizResult({ ok: true, message: "인증되었습니다. 이제 B2B 기능을 이용할 수 있어요." });
      } else {
        setBizResult({ ok: false, message: data.error ?? "인증에 실패했습니다." });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "요청 중 오류가 발생했습니다.";
      setBizResult({ ok: false, message: msg });
    } finally {
      setBizLoading(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold">로그인 / 인증</h1>
        <p className="text-sm text-neutral-500">
          B2B 기능(주문·견적)은 사업자등록번호 인증 후 이용할 수 있습니다.
        </p>
      </div>

      {/* (A) 카카오 로그인 */}
      <Card>
        <CardHeader>
          <CardTitle>카카오로 시작하기</CardTitle>
          <CardDescription>
            카카오 계정으로 간편하게 로그인하고 견적·주문을 시작하세요.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button
            className="w-full bg-brand hover:bg-brand-600"
            disabled={kakaoLoading}
            onClick={handleKakaoLogin}
          >
            {kakaoLoading ? "이동 중…" : "카카오로 시작하기"}
          </Button>
          {kakaoError ? (
            <p className="text-sm text-red-600" role="alert">
              {kakaoError}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* (B) 사업자등록번호 인증 */}
      <Card>
        <CardHeader>
          <CardTitle>사업자등록번호 인증</CardTitle>
          <CardDescription>
            인증을 완료하면 주문·견적 등 B2B 기능을 모두 이용할 수 있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="bizNo">사업자등록번호</Label>
            <Input
              id="bizNo"
              inputMode="numeric"
              placeholder="123-45-67890"
              value={bizNo}
              onChange={(e) => setBizNo(e.target.value)}
              disabled={bizLoading}
            />
          </div>
          <Button
            variant="outline"
            className="w-full border-brand text-brand-700 hover:bg-brand-50"
            disabled={bizLoading || bizNo.trim().length === 0}
            onClick={handleBizVerify}
          >
            {bizLoading ? "인증 중…" : "인증하기"}
          </Button>
          {bizResult ? (
            <p
              className={cn(
                "text-sm",
                bizResult.ok ? "text-green-600" : "text-red-600",
              )}
              role="status"
            >
              {bizResult.message}
            </p>
          ) : null}
        </CardContent>
        <CardFooter className="text-xs text-neutral-400">
          입력하신 정보는 사업자 진위 확인 용도로만 사용됩니다.
        </CardFooter>
      </Card>
    </main>
  );
}
