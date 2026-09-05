function isChineseLocale(locale) {
  return typeof locale === "string" && locale.toLowerCase().startsWith("zh");
}

function getReferenceLocale(locale) {
  return isChineseLocale(locale) ? "zh-cn" : "en";
}

module.exports = {
  getReferenceLocale,
  isChineseLocale,
};