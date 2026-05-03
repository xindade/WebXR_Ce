package com.vrballoon.game;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.widget.Toast;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    
    // ==================== 配置区域 ====================
    // WebXR 游戏部署地址（GitHub Pages）
    private static final String WEBXR_URL = "https://xindade.github.io/vr-balloon-shooter/";
    // ================================================
    
    // PICO VR Browser 包名
    private static final String PICO_VR_BROWSER = "com.picovr.vrbrowser";
    // Oculus/Meta Quest Browser
    private static final String META_QUEST_BROWSER = "com.oculus.browser";
    // ================================================
    
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 全屏沉浸模式
        setupImmersiveMode();
        
        // 如果配置了远程 URL，尝试启动 VR 浏览器
        if (!WEBXR_URL.isEmpty()) {
            if (launchVRBrowser(WEBXR_URL)) {
                // 启动成功，关闭当前 Activity
                finish();
                return;
            }
            // 如果启动失败，继续使用 WebView
        }
        
        // 默认：使用 Capacitor WebView
        super.onCreate(savedInstanceState);
    }
    
    private void setupImmersiveMode() {
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            | View.SYSTEM_UI_FLAG_FULLSCREEN
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
        );
    }
    
    /**
     * 启动 VR 浏览器并直接进入 VR 模式
     * @param url WebXR 内容 URL
     * @return 是否启动成功
     */
    private boolean launchVRBrowser(String url) {
        // 方案1: PICO VR Browser 深度链接
        // 格式: intent://open?url=URL#Intent-scheme=picovr;package=com.picovr.vrbrowser;end
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setData(Uri.parse(url));
            intent.setPackage(PICO_VR_BROWSER);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
            return true;
        } catch (ActivityNotFoundException e) {
            // PICO 浏览器未安装，尝试其他浏览器
        }
        
        // 方案2: Meta Quest Browser
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setData(Uri.parse(url));
            intent.setPackage(META_QUEST_BROWSER);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
            return true;
        } catch (ActivityNotFoundException e) {
            // Meta 浏览器未安装
        }
        
        // 方案3: 通用浏览器（不会自动进入 VR）
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            startActivity(intent);
            return true;
        } catch (Exception e) {
            Toast.makeText(this, "请安装 VR 浏览器", Toast.LENGTH_LONG).show();
            return false;
        }
    }
}
