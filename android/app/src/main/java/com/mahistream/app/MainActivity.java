package com.mahistream.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String CHANNEL_ID = "mahistream_notif_channel";
    private boolean permissionRequested = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(ImmersivePlugin.class);
        super.onCreate(savedInstanceState);
        createNotificationChannel();
        if (this.bridge != null && this.bridge.getWebView() != null) {
            this.bridge.getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm == null) return;
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return;

        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Notifikasi MahiStream",
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Notifikasi update anime dan pesan MahiStream");
        channel.enableVibration(true);
        channel.enableLights(true);

        Uri soundUri = Uri.parse("android.resource://" + getPackageName() + "/raw/mahistream_notif");
        AudioAttributes attrs = new AudioAttributes.Builder()
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .build();
        channel.setSound(soundUri, attrs);

        nm.createNotificationChannel(channel);
    }

    @Override
    public void onResume() {
        super.onResume();
        if (permissionRequested) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                permissionRequested = true;
                ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.POST_NOTIFICATIONS}, 101);
            }
        }
    }

    @Override
    public void onPause() {
        super.onPause();
        // Memastikan WebView media player tidak di-pause OS saat aplikasi berjalan di latar belakang / layar terkunci
        if (this.bridge != null && this.bridge.getWebView() != null) {
            this.bridge.getWebView().onResume();
        }
    }

    @Override
    public void onPictureInPictureModeChanged(boolean isInPiP, Configuration newConfig) {
        super.onPictureInPictureModeChanged(isInPiP, newConfig);
        // Kirim event ke WebView agar UI bisa menyesuaikan
        if (this.bridge != null && this.bridge.getWebView() != null) {
            final String js = "window.dispatchEvent(new CustomEvent('pipModeChanged',{detail:{pip:" + isInPiP + "}}));";
            runOnUiThread(() -> this.bridge.getWebView().evaluateJavascript(js, null));
        }
    }
}
