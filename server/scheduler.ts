import { pageStorage } from "./pageStorage";

export class CronjobScheduler {
  private intervals: Map<string, any> = new Map();
  private isRunning = false;

  constructor() {
    this.startMainLoop();
  }

  // Ana scheduler loop - her dakika kontrol eder
  private startMainLoop() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log("🕐 Cronjob Scheduler başlatıldı");

    // Her dakika çalışacak ana loop
    setInterval(async () => {
      try {
        await this.checkAndRunJobs();
      } catch (error) {
        console.error("❌ Scheduler hatası:", error);
      }
    }, 60000); // 1 dakika
  }

  // Aktif cronjob'ları kontrol et ve zamanı gelen işleri çalıştır
  private async checkAndRunJobs() {
    try {
      const cronjobs = await pageStorage.getCronjobs();
      const activeCronjobs = cronjobs.filter(job => job.isActive);

      for (const cronjob of activeCronjobs) {
        if (this.shouldRunNow(cronjob)) {
          console.log(`⏰ Cronjob zamanı geldi: ${cronjob.name}`);
          this.runJob(cronjob.id);
        }
      }
    } catch (error) {
      console.error("❌ Cronjob kontrolü sırasında hata:", error);
    }
  }

  // Cronjob'un çalışma zamanının gelip gelmediğini kontrol et
  private shouldRunNow(cronjob: any): boolean {
    const now = new Date();
    const lastRun = cronjob.lastRun ? new Date(cronjob.lastRun) : null;

    switch (cronjob.frequency) {
      case 'minutely':
        if (!lastRun) return true;
        return (now.getTime() - lastRun.getTime()) >= 60 * 1000; // 1 dakika

      case 'hourly':
        if (!lastRun) return true;
        return (now.getTime() - lastRun.getTime()) >= 60 * 60 * 1000; // 1 saat

      case 'daily':
        if (!lastRun) return true;
        return (now.getTime() - lastRun.getTime()) >= 24 * 60 * 60 * 1000; // 1 gün

      case 'weekly':
        if (!lastRun) return true;
        return (now.getTime() - lastRun.getTime()) >= 7 * 24 * 60 * 60 * 1000; // 1 hafta

      case 'monthly':
        if (!lastRun) return true;
        return (now.getTime() - lastRun.getTime()) >= 30 * 24 * 60 * 60 * 1000; // 30 gün

      case 'custom':
        // Custom cron expression kontrolü (gelecekte eklenebilir)
        return false;

      default:
        return false;
    }
  }

  // Cronjob'u çalıştır
  private async runJob(cronjobId: string) {
    try {
      console.log(`🚀 Otomatik cronjob çalıştırılıyor: ${cronjobId}`);
      
      // Manuel run endpoint'ini çağır
      const response = await fetch(`http://localhost:3000/api/cronjobs/${cronjobId}/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        console.log(`✅ Cronjob başarıyla tamamlandı: ${cronjobId}`);
      } else {
        console.log(`❌ Cronjob başarısız: ${cronjobId}`);
      }
    } catch (error) {
      console.error(`❌ Cronjob çalıştırma hatası (${cronjobId}):`, error);
    }
  }

  // Scheduler'ı durdur
  stop() {
    this.intervals.forEach((interval) => {
      clearInterval(interval);
    });
    this.intervals.clear();
    this.isRunning = false;
    console.log("🛑 Cronjob Scheduler durduruldu");
  }

  // Belirli bir cronjob'u hemen çalıştır
  async runJobNow(cronjobId: string) {
    await this.runJob(cronjobId);
  }
}

// Singleton instance
export const scheduler = new CronjobScheduler();
