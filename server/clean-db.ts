import { db } from "./db.js";

console.log("🧹 جاري تفريغ وتنظيف قاعدة البيانات بالكامل...");

try {
  db.exec(`
    PRAGMA foreign_keys = OFF;
    DELETE FROM deposits;
    DELETE FROM trades;
    DELETE FROM refund_requests;
    DELETE FROM link_codes;
    DELETE FROM admin_logs;
    DELETE FROM users;
    PRAGMA foreign_keys = ON;
    VACUUM;
  `);
  console.log("✅ تم تفريغ قاعدة البيانات وتصفير جميع الحسابات والسجلات بنجاح!");
} catch (err: any) {
  console.error("❌ حدث خطأ أثناء تنظيف قاعدة البيانات:", err.message);
}

process.exit(0);
