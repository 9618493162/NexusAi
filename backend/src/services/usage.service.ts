import { prisma } from "../config/database";

export async function getUserUsage(userId: string) {
  const stats = await prisma.usageStat.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const totalTokens = stats.reduce((sum, s) => sum + s.tokens, 0);
  const byModel = stats.reduce((acc, s) => {
    acc[s.model] = (acc[s.model] || 0) + s.tokens;
    return acc;
  }, {} as Record<string, number>);

  const byType = stats.reduce((acc, s) => {
    acc[s.type] = (acc[s.type] || 0) + s.tokens;
    return acc;
  }, {} as Record<string, number>);

  return {
    totalTokens,
    totalRequests: stats.length,
    byModel,
    byType,
    recent: stats.slice(0, 20),
  };
}
