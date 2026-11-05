import assert from "node:assert/strict";
import test from "node:test";
import { monthName, translateText } from "./i18n";

test("translates shared interface and dynamic labels into Arabic", () => {
  assert.equal(translateText("Weekly schedule", "ar"), "الجدول الأسبوعي");
  assert.equal(translateText("Friday", "ar"), "الجمعة");
  assert.equal(translateText("6 shifts this week", "ar"), "6 مناوبة هذا الأسبوع");
  assert.equal(translateText("4 nurses scheduled", "ar"), "4 ممرضين مجدولين");
  assert.equal(translateText("10 hrs", "ar"), "١٠ ساعات");
  assert.equal(translateText("Senior Nurse", "ar"), "ممرضة أولى");
  assert.equal(
    translateText("Two Senior Nurses are assigned on Friday. This violates the standard scheduling policy.", "ar"),
    "تم تعيين ممرضتين أولى في يوم الجمعة، وهذا يخالف سياسة الجدولة المعتمدة.",
  );
  assert.equal(
    translateText("Only Senior Nurses were available for Friday coverage. The assignment was created as an operational exception.", "ar"),
    "تعذر توفير ممرضة عادية ليوم الجمعة، وتم إنشاء الجدول كاستثناء تشغيلي معتمد.",
  );
  assert.equal(translateText(" active nurses", "ar"), " ممرض نشط");
  assert.equal(translateText("nurses", "ar"), "ممرضون");
});

test("preserves English UI copy and formats month names for the selected language", () => {
  assert.equal(translateText("Weekly schedule", "en"), "Weekly schedule");
  assert.equal(monthName(2026, 11, "ar"), "نوفمبر 2026");
  assert.equal(monthName(2026, 11, "en"), "November 2026");
});
