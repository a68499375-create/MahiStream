package com.mahistream.hd;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.pm.ActivityInfo;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.view.Window;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.widget.FrameLayout;

import com.getcapacitor.BridgeActivity;

/**
 * MahiStream Android entrypoint.
 *
 * Custom WebChromeClient supaya tombol fullscreen di dalam iframe embed
 * (playmogo / streampoi / vidnest / desustream / dll.) otomatis berfungsi:
 * saat player video memanggil HTML5 Fullscreen API
 * (`element.requestFullscreen()`), Android WebView akan memanggil
 * `onShowCustomView`. Di sini kita ambil view dari player, tampilkan
 * sebagai full-window di atas layar, sembunyikan WebView utama, dan paksa
 * orientasi landscape — persis seperti perilaku fullscreen native.
 *
 * Tanpa override ini, tombol fullscreen di player iframe tidak melakukan
 * apa-apa karena Capacitor's default WebChromeClient tidak handle
 * onShowCustomView.
 */
public class MainActivity extends BridgeActivity {

  private View customView;
  private WebChromeClient.CustomViewCallback customViewCallback;
  private int originalOrientation;
  private int originalSystemUiVisibility;

  @SuppressLint("SourceLockedOrientationActivity")
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    final WebView webView = this.bridge.getWebView();
    if (webView == null) return;

    // Adblock LEVEL NETWORK — semua request HTTP dari WebView (termasuk
    // dari iframe cross-origin embed Nekopoi/Kuramanime/Otaku/Samehadaku)
    // dicegat dan request ke domain iklan diblokir total. Lihat
    // AdBlockingWebViewClient untuk daftar domain dan pola URL yg di-block.
    webView.setWebViewClient(new AdBlockingWebViewClient(this.bridge));

    webView.setWebChromeClient(new WebChromeClient() {
      @Override
      public void onShowCustomView(View view, CustomViewCallback callback) {
        if (customView != null) {
          callback.onCustomViewHidden();
          return;
        }
        customView = view;
        customViewCallback = callback;
        originalOrientation = getRequestedOrientation();
        Window window = getWindow();
        originalSystemUiVisibility = window.getDecorView().getSystemUiVisibility();

        // Sembunyikan WebView utama
        webView.setVisibility(View.GONE);

        // Tambahkan custom view (player fullscreen) ke decor view
        FrameLayout decorView = (FrameLayout) window.getDecorView();
        decorView.addView(
          customView,
          new ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
          )
        );

        // Immersive fullscreen + landscape (otomatis "ngedetec device" HP)
        window.getDecorView().setSystemUiVisibility(
          View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_FULLSCREEN
            | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        );
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
      }

      @Override
      public void onHideCustomView() {
        if (customView == null) return;
        Window window = getWindow();
        FrameLayout decorView = (FrameLayout) window.getDecorView();
        decorView.removeView(customView);
        customView = null;

        // Restore WebView dan orientasi
        webView.setVisibility(View.VISIBLE);
        window.getDecorView().setSystemUiVisibility(originalSystemUiVisibility);
        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        setRequestedOrientation(originalOrientation);

        if (customViewCallback != null) {
          customViewCallback.onCustomViewHidden();
          customViewCallback = null;
        }
      }
    });
  }
}
