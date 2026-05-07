package com.x.webxrce;

import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebView;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private Handler handler = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 保持屏幕常亮（VR体验）
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        // 沉浸式全屏，隐藏系统栏，VR体验必须
        hideSystemUI();

        // 等待 WebView 加载完成后自动触发 VR
        handler.postDelayed(() -> autoEnterVR(), 2500);
    }

    private void autoEnterVR() {
        try {
            WebView webView = getBridge().getWebView();
            if (webView != null) {
                final float btnX = webView.getWidth() / 2f;
                final float btnY = webView.getHeight() / 2f;
                
                // 直接发送触摸事件
                sendTouchEvent(webView, MotionEvent.ACTION_DOWN, btnX, btnY);
                handler.postDelayed(() -> {
                    sendTouchEvent(webView, MotionEvent.ACTION_UP, btnX, btnY);
                }, 100);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void sendTouchEvent(WebView webView, int action, float x, float y) {
        try {
            MotionEvent event = MotionEvent.obtain(
                System.currentTimeMillis(),
                System.currentTimeMillis(),
                action,
                x, y,
                1.0f, 1.0f,
                0, 1, 1,
                0, 0
            );
            webView.dispatchTouchEvent(event);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            hideSystemUI();
        }
    }

    private void hideSystemUI() {
        View decorView = getWindow().getDecorView();
        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(getWindow(), decorView);
        if (controller != null) {
            controller.hide(WindowInsetsCompat.Type.systemBars());
            controller.setSystemBarsBehavior(
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            );
        }
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
    }
}
