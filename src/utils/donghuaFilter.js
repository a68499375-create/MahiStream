// Heuristik deteksi donghua (anime Chinese) — Kurama memuat campuran anime
// Jepang dan donghua di endpoint listing, padahal app fokus ke anime Jepang.
// Frontend filter berdasarkan pola judul (pinyin Mandarin yang khas).
//
// Cara kerja: kalau judul cocok salah satu pattern Chinese pinyin yang
// umum di Kurama, anggap donghua dan skip dari list. Tidak 100% akurat,
// tetapi mengeliminasi mayoritas false-positive (Doupo Cangqiong, Wushen
// Zhuzai, Xianwu Zhuan, Wu Shang Shen Di, Shenkong Bi An, Guangyin Zhi
// Wai, Dushi Gu Xian Yi, dst).

const CHINESE_PINYIN_TOKENS = [
  // Cultivation/xianxia novel-ish keywords
  'doupo', 'cangqiong', 'wushen', 'zhuzai', 'xianwu', 'zhuan',
  'wu shang', 'shen di', 'shenkong', 'bi an',
  'guangyin', 'zhi wai', 'dushi', 'gu xian',
  'guimi', 'zhu tebie', 'liewu', 'qian shen', 'shengshou',
  'jiu zhou', 'shenmu', 'zhu shen', 'wanjie',
  'jianjia', 'huyao', 'xuanwu',
  // Common donghua title openers
  'tianjie', 'tianxia', 'tianzun', 'tianshen', 'tian ji',
  'wuxue', 'wushuang', 'wujie',
  'jueshi', 'jinwo', 'jinjian',
  'zhanshen', 'zhanhuang', 'zhandi',
  'shen jiang', 'shenwei', 'shenhao',
  'menglie', 'gewang', 'shaonian',
  'yinghua', 'huazhao', 'huazhi', 'fengshen',
  'haotian', 'liantian', 'longwang',
  'qiankun', 'wujian', 'wushang',
  // Pinyin compounds yang muncul di judul donghua viral
  'douluo', 'wanmei', 'wujin', 'shaodianshen',
  // Patterns dari title donghua yg sering muncul di Kurama
  'ze tian', 'tian ji', 'lian qi', 'shi wan', 'wan nian',
  'wan jie', 'du zun', 'jiang ye', 'jue dian',
  'qing chuan', 'wan lai', 'shang gu', 'shanhe',
  'yongheng', 'shengshen', 'shengwang',
  'mowang', 'mojun', 'mozun', 'yaozun', 'sheng zun',
  'jianlai', 'jianshen', 'jian ling', 'jian zun', 'jian dao',
  'jian lai', 'tian ji',
  'xian gui', 'xian dao', 'xian zun', 'xian wang', 'xian jun',
  'huangfei', 'huangling', 'wanggu', 'wanmo',
];

const looksLikeDonghua = (title = '') => {
  if (!title) return false;
  const t = String(title).toLowerCase();
  // Tag eksplisit
  if (/\bdonghua\b/.test(t) || /\bchinese\s+animation\b/.test(t)) return true;
  // Ada CJK character di judul (paling reliable)
  if (/[一-鿿㐀-䶿]/.test(title)) return true;
  // Pola pinyin: minimal 1 token Chinese match (turun dari 2 supaya lebih
  // agresif catch single-keyword donghua mis. "Ze Tian Ji").
  for (const tok of CHINESE_PINYIN_TOKENS) {
    if (t.includes(tok)) return true;
  }
  // Pola judul Chinese tipikal: banyak kata 2-3 huruf, no Japanese-style
  // suffix (no/wa/wo/ni/to). Heuristik: kalau judul terdiri dari 4+ kata
  // pendek (max 5 huruf) dan tidak ada function word Jepang, anggap donghua.
  const tokens = t.replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
  if (tokens.length >= 4) {
    const japaneseFunctionWords = ['no', 'wa', 'wo', 'ni', 'to', 'de', 'ga', 'mo', 'ka', 'ya', 'na', 'made', 'kara', 'yori', 'koto', 'mono'];
    const hasJpFunctionWord = tokens.some((w) => japaneseFunctionWords.includes(w));
    const allShort = tokens.every((w) => w.length <= 5);
    if (allShort && !hasJpFunctionWord) return true;
  }
  return false;
};

export const filterDonghua = (list = []) => {
  if (!Array.isArray(list)) return [];
  return list.filter((item) => {
    const title = item?.title || item?.name || '';
    return !looksLikeDonghua(title);
  });
};

export { looksLikeDonghua };
