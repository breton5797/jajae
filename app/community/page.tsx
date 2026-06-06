import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CommunityComposer } from "@/components/community-composer";
import { loadCommunityPosts } from "@/lib/data/community";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  thread: "자유글",
  qna: "Q&A",
  notice: "정보",
};

export default async function CommunityPage() {
  const posts = await loadCommunityPosts();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">시공사 커뮤니티</h1>
        <p className="text-sm text-muted-foreground">
          현장 노하우와 자재 정보를 나누고 질문하세요.
        </p>
      </div>

      <CommunityComposer />

      <div className="space-y-3">
        {posts.length === 0 && (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              아직 게시글이 없습니다. 첫 글을 남겨보세요.
            </CardContent>
          </Card>
        )}
        {posts.map((p) => (
          <Card key={p.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Badge variant="neutral">{TYPE_LABEL[p.type] ?? p.type}</Badge>
                {p.title}
              </CardTitle>
            </CardHeader>
            {p.body && (
              <CardContent>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {p.body}
                </p>
              </CardContent>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
