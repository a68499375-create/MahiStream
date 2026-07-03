package com.mahistream.hd;

import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;

import java.io.ByteArrayInputStream;
import java.util.Arrays;
import java.util.List;
import java.util.regex.Pattern;

/**
 * AdBlockingWebViewClient — adblock TOTAL di level network WebView.
 *
 * Capacitor BridgeWebViewClient di-extend supaya semua request HTTP yang
 * keluar dari WebView (termasuk dari iframe cross-origin seperti
 * playmogo.com / streampoi.com / vidnest yang dipakai Nekopoi, dan
 * desustream / blogger embed dari Otakudesu / Kuramanime / Samehadaku)
 * dicegat di shouldInterceptRequest. Kalau URL-nya match daftar domain
 * iklan / pola URL pop-up, request dikembalikan sebagai response kosong
 * 200 sehingga script iklan tidak pernah dimuat. Iframe video tetap
 * berjalan karena hanya request iklan-nya yang di-block.
 *
 * Pendekatan ini lebih kuat dari adblock JavaScript (`adblock.js`) karena:
 *  - Bekerja LINTAS ORIGIN (frontend JS tidak bisa nyentuh iframe lain).
 *  - Bekerja sebelum JS iklan eksekusi (network-level intercept).
 *  - Tidak bisa di-bypass oleh script iklan yang nge-set iframe.contentWindow.open dll.
 */
public class AdBlockingWebViewClient extends BridgeWebViewClient {

    public AdBlockingWebViewClient(Bridge bridge) {
        super(bridge);
    }

    // Daftar substring host yang otomatis di-block. Cocok kalau substring
    // ini muncul di hostname URL (case-insensitive). Tambah baru dengan
    // menambahkan entry — tidak perlu deploy ulang frontend.
    private static final List<String> AD_DOMAINS = Arrays.asList(
        // Google
        "googlesyndication.com", "doubleclick.net", "googleadservices.com",
        "googletagservices.com", "googletagmanager.com", "google-analytics.com",
        "adservice.google.com", "pagead2.googlesyndication.com",
        // Adult / popunder
        "adnxs", "adsrv.org", "adsrv.", "adsterra", "exoclick", "exosrv",
        "juicyads", "trafficjunky", "propellerads", "propu.sh", "propu-sh.com",
        "hilltopads", "clickadu", "richpush", "pushnami", "pushwoosh",
        "pushhouse", "onclickads", "onclkds", "a-ads.com", "a-ads.net",
        "highperformanceformat.com", "profitabledisplaynetwork.com",
        "megapu.sh", "megapush", "popads.net", "popcash.net", "popunder",
        "bidvertiser", "adcash.com", "monetag", "trafficstars", "tsyndicate",
        // Native / clickbait / native push
        "mgid.com", "taboola.com", "outbrain.com", "revcontent.com",
        "plugrush", "adskeeper", "galaksion", "admaven",
        // Crypto / mining / fingerprint
        "coinhive", "crypto-loot", "cointraffic", "webminepool",
        "histats.com", "statcounter.com", "mc.yandex", "yandex.ru/metrika",
        // Misc dating / sponsor
        "yllix", "adblade", "mediavine", "bontrilou", "partypoker",
        "betway", "1xbet", "stake.com",
        // URL shortener iklan-heavy (klik tidak sengaja → halaman iklan)
        "ouo.io/zpb", "shrinkme.io",
        // User-reported ad/popup domains (tambahkan saat ada laporan baru)
        "ofcgcdcvk.com",
        // Tracker / analytics
        "scorecardresearch.com", "quantserve.com", "moatads.com",
        "comscore.com", "adsystem.com"
    );

    // Pola path URL yang biasa dipakai banyak server iklan — ini menangkap
    // URL yang domain-nya tidak ada di daftar (jaringan ad baru / domain
    // proxy) tapi pattern-nya jelas terlihat seperti iklan.
    private static final List<Pattern> AD_PATH_PATTERNS = Arrays.asList(
        Pattern.compile("/ads?[/._-]"),
        Pattern.compile("/popunder"),
        Pattern.compile("/popup[._/]"),
        Pattern.compile("/banner-?ad"),
        Pattern.compile("/sponsor"),
        Pattern.compile("/pagead"),
        Pattern.compile("/serve_ad"),
        Pattern.compile("/adframe"),
        Pattern.compile("\\.adsbygoogle\\."),
        Pattern.compile("\\.adsense\\."),
        // Pola URL untuk popunder generic: domain pendek random + path pop/redirect
        Pattern.compile("//[a-z]{6,12}\\.com/(?:p|pop|push|track|click|redirect|c)\\b"),
        // Pola umum untuk file js/swf yang dipakai iklan
        Pattern.compile("/(?:apu|sw|tag|invoke|loader|broker|bid|rtb)\\.(?:js|swf)"),
        Pattern.compile("/(?:popunder|popup|interstitial|prerolled?)\\.(?:js|html)"),
        Pattern.compile("/native[-_]?ads?"),
        // Pattern pop network: /serve, /show, /imp, /click di domain pihak ketiga
        Pattern.compile("/(?:serve|show|imp|click|view)\\?(?:zone|aff|pid|sid|cid)=")
    );

    // Pola HOSTNAME mencurigakan: domain yang terdiri dari karakter
    // pseudo-random tanpa makna (mis. ofcgcdcvk.com, dlvxqzr.net) sangat
    // sering dipakai jaringan iklan rotasi domain. Konsonan-heavy &
    // 8-15 karakter di .com/.net/.top/.xyz/.click/.online/.life adalah
    // cap khas situs popunder/clickbait.
    private static final Pattern RANDOM_AD_HOST = Pattern.compile(
        "^[a-z]{8,16}\\.(?:com|net|top|xyz|click|online|life|info|fun|cyou|sbs|cfd|skin|monster|space|vip|store|shop|world)$"
    );
    // Tapi banyak domain MA legit juga panjang/random-looking (mis.
    // r2.nyomo.my.id) — jadi pola ini cuma dipakai sebagai sinyal tambahan.
    // True kalau hostname seluruhnya konsonan acak (≥6 konsonan tanpa vokal
    // berturut-turut), biasanya pasti bukan domain manusiawi.
    private static final Pattern CONSONANT_HEAVY = Pattern.compile(
        "^[bcdfghjklmnpqrstvwxz]{6,}\\.[a-z]+$"
    );

    // Domain WHITELIST — harus diizinkan walau ada substring "ads" di URL
    // (mis. nama anime / poster / nama file dengan kata "ads"). Kalau host
    // request masuk daftar ini, lewati pengecekan iklan.
    private static final List<String> SAFE_HOST_SUFFIXES = Arrays.asList(
        "103.67.244.19.nip.io", "nip.io",
        "kuramanime.ing", "kuramanime.lol", "kuramanime.run", "kuramanime.com",
        "otakudesu.blog", "otakudesu.cloud",
        "samehadaku.email", "samehadaku.org", "samehadaku.now",
        "nekopoi.care", "nekopoi.com",
        "pixeldrain.com", "pixeldra.in", "mp4upload.com", "krakenfiles.com",
        "gofile.io", "r2.nyomo.my.id", "iino.my.id",
        "playmogo.com", "streampoi.com", "streamtape.com", "vidnest.fun",
        "desustream.info", "filedon.co", "blogger.com",
        "jikan.moe", "placehold.co",
        "googleapis.com", "gstatic.com", // CDN buat fonts/jQuery — bukan ads
        "localhost", "127.0.0.1", "10.0.2.2",
        "capacitor", "ionic"
    );

    private static boolean isSafeHost(String host) {
        if (host == null) return false;
        String h = host.toLowerCase();
        for (String suffix : SAFE_HOST_SUFFIXES) {
            if (h.equals(suffix) || h.endsWith("." + suffix) || h.endsWith(suffix)) return true;
        }
        return false;
    }

    private static boolean isAdUrl(String urlLower, String hostLower) {
        if (urlLower == null) return false;
        if (isSafeHost(hostLower)) return false;
        for (String d : AD_DOMAINS) {
            if (urlLower.contains(d)) return true;
        }
        for (Pattern p : AD_PATH_PATTERNS) {
            if (p.matcher(urlLower).find()) return true;
        }
        // Random-looking hostname → besar kemungkinan iklan rotasi domain
        // (ofcgcdcvk.com style). Whitelist sudah dicek di awal.
        if (hostLower != null && !hostLower.isEmpty()) {
            String hostOnly = hostLower;
            // Strip subdomain — ambil 2 bagian terakhir saja (domain.tld)
            int firstDot = hostLower.indexOf('.');
            if (firstDot > 0 && firstDot < hostLower.length() - 1) {
                String[] parts = hostLower.split("\\.");
                if (parts.length >= 2) {
                    hostOnly = parts[parts.length - 2] + "." + parts[parts.length - 1];
                }
            }
            if (RANDOM_AD_HOST.matcher(hostOnly).matches() && CONSONANT_HEAVY.matcher(hostOnly).find()) {
                return true;
            }
        }
        return false;
    }

    private static WebResourceResponse blockedResponse() {
        // Response kosong 200 — beberapa script iklan crash kalau dapat 4xx,
        // sementara 200 kosong membuat mereka menganggap "loaded but empty"
        // dan tidak retry agresif.
        return new WebResourceResponse(
            "text/plain",
            "utf-8",
            new ByteArrayInputStream(new byte[0])
        );
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        try {
            Uri uri = request.getUrl();
            if (uri != null) {
                String urlLower = uri.toString().toLowerCase();
                String hostLower = uri.getHost() == null ? "" : uri.getHost().toLowerCase();
                if (isAdUrl(urlLower, hostLower)) {
                    return blockedResponse();
                }
            }
        } catch (Exception _e) {
            // Jangan biarkan adblock crash app — fallthrough ke bridge default.
        }
        return super.shouldInterceptRequest(view, request);
    }
}
