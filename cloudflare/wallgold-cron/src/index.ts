export interface Env {
  CRON_SECRET: string;
}

export default {
  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    console.log(
      `[WallGold Cron] ${controller.cron} @ ${new Date(
        controller.scheduledTime,
      ).toISOString()}`,
    );

    const response = await fetch(
      "https://walldb.vercel.app/api/cron/wallgold",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.CRON_SECRET}`,
          "Content-Type": "application/json",
        },
        body: "{}",
      },
    );

    const body = await response.text();

    console.log(
      `[WallGold Cron] HTTP ${response.status}: ${body}`,
    );

    if (!response.ok) {
      throw new Error(
        `WallDB collector failed: HTTP ${response.status} - ${body}`,
      );
    }
  },
};