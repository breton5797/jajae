import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClientLoginForm } from "@/components/client-login-form";

export const dynamic = "force-dynamic";

export default function ClientLoginPage() {
  return (
    <div className="mx-auto max-w-sm">
      <Card>
        <CardHeader>
          <CardTitle>입주민 로그인</CardTitle>
        </CardHeader>
        <CardContent>
          <ClientLoginForm />
        </CardContent>
      </Card>
    </div>
  );
}
