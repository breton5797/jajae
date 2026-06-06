"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { validatePhoneLogin } from "@/lib/client-portal";

export function ClientLoginForm() {
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [stage, setStage] = useState<"phone" | "otp">("phone");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendOtp = async () => {
    const v = validatePhoneLogin(phone);
    if (!v.ok) {
      setError(v.error);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const sb = createClient();
      const { error: e } = await sb.auth.signInWithOtp({ phone });
      if (e) {
        setError(e.message);
        return;
      }
      setStage("otp");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      const sb = createClient();
      const { error: e } = await sb.auth.verifyOtp({ phone, token: otp, type: "sms" });
      if (e) {
        setError(e.message);
        return;
      }
      window.location.href = "/client";
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {stage === "phone" ? (
        <>
          <div className="space-y-1">
            <Label htmlFor="phone">휴대폰 번호</Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="010-0000-0000"
              inputMode="tel"
            />
          </div>
          <Button onClick={sendOtp} disabled={busy} className="w-full">
            {busy ? "발송 중..." : "인증번호 받기"}
          </Button>
        </>
      ) : (
        <>
          <div className="space-y-1">
            <Label htmlFor="otp">인증번호</Label>
            <Input
              id="otp"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="6자리"
              inputMode="numeric"
            />
          </div>
          <Button onClick={verify} disabled={busy} className="w-full">
            {busy ? "확인 중..." : "로그인"}
          </Button>
        </>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">
        입주민은 휴대폰 인증만으로 초대된 현장을 확인할 수 있습니다. (SMS 발송 설정 필요)
      </p>
    </div>
  );
}
