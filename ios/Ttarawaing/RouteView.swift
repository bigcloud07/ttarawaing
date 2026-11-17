import SwiftUI
import WebKit

struct RouteView: View {
    @StateObject private var browser = RouteBrowser()

    var body: some View {
        ZStack {
            GeometryReader { geometry in
                WebView(browser: browser, safeAreaInsets: geometry.safeAreaInsets)
                    .ignoresSafeArea(.container)
            }
            .accessibilityHidden(browser.hasFailed)
            if browser.hasFailed {
                ContentUnavailableView {
                    Label("경로 화면을 열 수 없어요", systemImage: "wifi.exclamationmark")
                } description: {
                    Text("인터넷 연결을 확인한 뒤 다시 시도해 주세요.")
                } actions: {
                    VStack(spacing: 12) {
                        Button("다시 시도") { browser.load() }
                            .buttonStyle(.borderedProminent)
                    }
                    .controlSize(.large)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(.background)
            } else if browser.isLoading {
                ProgressView("경로 화면을 여는 중")
                    .padding(20)
                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
                    .allowsHitTesting(false)
            }
        }
    }
}

private struct WebView: UIViewRepresentable {
    let browser: RouteBrowser
    let safeAreaInsets: EdgeInsets

    func makeUIView(context: Context) -> UIView { browser.view }

    func updateUIView(_ view: UIView, context: Context) {
        browser.updateSafeAreaInsets(safeAreaInsets)
    }
}

@MainActor
final class RouteBrowser: NSObject, ObservableObject, WKNavigationDelegate, WKUIDelegate, UIGestureRecognizerDelegate {
    private static let origin = URL(string: "https://ttarawaing.vercel.app")!
    private static let rental = URL(string: "bikeseoul://action")!
    private static let rentalStore = URL(string: "https://apps.apple.com/kr/app/id1037272004")!

    let webView: WKWebView
    let view = UIView()
    @Published private(set) var isLoading = true
    @Published private(set) var hasFailed = false
    private var activeNavigation: WKNavigation?
    private var safeAreaInsets = EdgeInsets()

    override init() {
        let configuration = WKWebViewConfiguration()
        configuration.applicationNameForUserAgent = "TtarawaingApp/iOS"
        // 웹 배포 여부와 관계없이 입력 초점과 연속 탭으로 인한 자동 확대를 방지한다.
        configuration.userContentController.addUserScript(WKUserScript(
            source: """
            // 화면은 끝까지 채우고 조작 요소에만 안전 영역 여백을 적용한다.
            const viewport = document.querySelector('meta[name="viewport"]') ?? document.createElement('meta');
            viewport.name = 'viewport';
            const viewportOptions = (viewport.content || 'width=device-width, initial-scale=1')
                .split(',').filter(option => !option.trim().startsWith('viewport-fit'));
            viewport.content = [...viewportOptions, 'viewport-fit=cover'].join(',');
            if (!viewport.isConnected) document.head.appendChild(viewport);
            const style = document.createElement('style');
            style.textContent = `
                html { touch-action: manipulation; }
                .input-shell input { font-size: 16px !important; }
                .topbar { display: none !important; }
                .workspace.has-route .search-section { display: none; }
                .app-result-navigation {
                    display: flex;
                    position: fixed;
                    top: calc(var(--app-safe-area-top, env(safe-area-inset-top)) + 12px);
                    left: calc(var(--app-safe-area-left, env(safe-area-inset-left)) + 12px);
                    z-index: 1200;
                }
                .app-result-navigation a {
                    width: 44px;
                    min-height: 44px;
                    justify-content: center;
                    gap: 0;
                    padding: 0;
                    border: 1px solid #e1e8e3;
                    border-radius: 24px;
                    background: #ffffff;
                    box-shadow: 0 3px 12px rgba(23, 35, 30, 0.16);
                }
                .app-result-navigation a span {
                    position: absolute;
                    width: 1px;
                    height: 1px;
                    overflow: hidden;
                    clip-path: inset(50%);
                    white-space: nowrap;
                }
                body:not(:has(.app-shell)) {
                    padding: var(--app-safe-area-top, env(safe-area-inset-top)) var(--app-safe-area-right, env(safe-area-inset-right))
                        var(--app-safe-area-bottom, env(safe-area-inset-bottom)) var(--app-safe-area-left, env(safe-area-inset-left));
                }
                .route-panel {
                    padding-left: var(--app-safe-area-left, env(safe-area-inset-left));
                    padding-right: var(--app-safe-area-right, env(safe-area-inset-right));
                }
                .workspace:not(.has-route):not(.has-nearby) .search-section {
                    padding-top: calc(25px + var(--app-safe-area-top, env(safe-area-inset-top)));
                    padding-bottom: calc(24px + var(--app-safe-area-bottom, env(safe-area-inset-bottom)));
                }
                .toast { top: calc(var(--app-safe-area-top, env(safe-area-inset-top)) + 12px); }
                @media (max-width: 900px) {
                    .workspace { min-height: 100dvh !important; }
                    .workspace.has-nearby { height: 100dvh !important; min-height: 0 !important; }
                    .mobile-details-toggle { top: var(--app-safe-area-top, env(safe-area-inset-top)) !important; }
                    .workspace .map-panel { scroll-margin-block-start: 0 !important; }
                    .workspace.has-route.is-mobile-details-minimized .map-panel {
                        height: calc(100dvh - 44px - var(--app-safe-area-bottom, env(safe-area-inset-bottom))) !important;
                    }
                    .workspace.has-route .route-panel { padding-bottom: var(--app-safe-area-bottom, env(safe-area-inset-bottom)); }
                    .workspace.has-route.is-mobile-details-minimized .route-panel {
                        height: calc(44px + var(--app-safe-area-bottom, env(safe-area-inset-bottom)));
                        flex-basis: calc(44px + var(--app-safe-area-bottom, env(safe-area-inset-bottom)));
                    }
                    .map-station-card {
                        left: calc(14px + var(--app-safe-area-left, env(safe-area-inset-left)));
                        right: calc(14px + var(--app-safe-area-right, env(safe-area-inset-right)));
                    }
                    .map-guide-controls { right: calc(14px + var(--app-safe-area-right, env(safe-area-inset-right))); }
                    .workspace.has-nearby .map-guide-controls {
                        right: calc(14px + var(--app-safe-area-right, env(safe-area-inset-right)));
                        bottom: calc(14px + var(--app-safe-area-bottom, env(safe-area-inset-bottom)));
                    }
                    .nearby-result-card, .nearby-map > .nearby-result-card {
                        left: calc(14px + var(--app-safe-area-left, env(safe-area-inset-left)));
                        right: calc(66px + var(--app-safe-area-right, env(safe-area-inset-right)));
                        bottom: calc(14px + var(--app-safe-area-bottom, env(safe-area-inset-bottom)));
                    }
                    .workspace.has-route.has-nearby.is-mobile-details-minimized .map-panel {
                        height: 100% !important;
                    }
                    .result-section { scroll-margin-block-start: calc(60px + var(--app-safe-area-top, env(safe-area-inset-top))) !important; }
                    .workspace.has-route { min-height: 100dvh !important; }
                }
            `;
            document.head.appendChild(style);
            """,
            injectionTime: .atDocumentEnd,
            forMainFrameOnly: true
        ))
        webView = WKWebView(frame: .zero, configuration: configuration)
        super.init()
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        let resultBackSwipe = UIScreenEdgePanGestureRecognizer(target: self, action: #selector(swipeBackFromResult))
        resultBackSwipe.edges = .left
        resultBackSwipe.delegate = self
        // WebView 안에 붙이면 지도처럼 터치를 직접 처리하는 웹 요소 위에서 WebKit이 제스처를 막는다.
        webView.frame = view.bounds
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(webView)
        view.addGestureRecognizer(resultBackSwipe)
        #if DEBUG
        webView.isInspectable = true
        #endif
        load()
    }

    func updateSafeAreaInsets(_ insets: EdgeInsets) {
        guard safeAreaInsets != insets else { return }
        safeAreaInsets = insets
        applySafeAreaInsets()
    }

    private func applySafeAreaInsets() {
        // 전체 화면 WebView의 CSS 안전 영역이 0이어도 실제 기기 여백을 전달한다.
        webView.evaluateJavaScript("""
            document.documentElement.style.setProperty('--app-safe-area-top', '\(safeAreaInsets.top)px');
            document.documentElement.style.setProperty('--app-safe-area-bottom', '\(safeAreaInsets.bottom)px');
            document.documentElement.style.setProperty('--app-safe-area-left', '\(safeAreaInsets.leading)px');
            document.documentElement.style.setProperty('--app-safe-area-right', '\(safeAreaInsets.trailing)px');
            """)
    }

    // 검색 결과는 웹 방문 기록을 남기지 않아 WebView 기본 스와이프로는 검색 화면에 돌아갈 수 없다.
    @objc private func swipeBackFromResult(_ gesture: UIScreenEdgePanGestureRecognizer) {
        guard gesture.state == .ended,
              gesture.translation(in: webView).x > 80 || gesture.velocity(in: webView).x > 600 else { return }
        webView.evaluateJavaScript("""
            (() => {
                const back = document.querySelector('.app-result-navigation a');
                back?.click();
                return Boolean(back);
            })()
            """) { result, _ in
            if result as? Bool == true {
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
            }
        }
    }

    func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        !webView.canGoBack
    }

    func gestureRecognizer(
        _ gestureRecognizer: UIGestureRecognizer,
        shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
    ) -> Bool {
        true
    }

    func load() {
        hasFailed = false
        isLoading = true
        activeNavigation = webView.load(
            URLRequest(url: Self.origin, cachePolicy: .reloadRevalidatingCacheData, timeoutInterval: 20)
        )
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor action: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = action.request.url else {
            decisionHandler(.cancel)
            return
        }

        if action.targetFrame?.isMainFrame == false {
            let allowed = url.scheme == "https" || url.absoluteString == "about:blank"
            decisionHandler(allowed ? .allow : .cancel)
            return
        }

        if Self.isAppURL(url) {
            if action.targetFrame == nil {
                decisionHandler(.cancel)
                webView.load(action.request)
            } else {
                decisionHandler(.allow)
            }
            return
        }

        decisionHandler(.cancel)
        guard action.sourceFrame.isMainFrame, Self.isAppURL(action.sourceFrame.request.url) else {
            return
        }

        if url == Self.rental {
            UIApplication.shared.open(url) { opened in
                if !opened { UIApplication.shared.open(Self.rentalStore) }
            }
        } else if url == Self.rentalStore ||
                  (action.navigationType == .linkActivated && (url.scheme == "https" || url.scheme == "mailto")) {
            UIApplication.shared.open(url)
        }
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor response: WKNavigationResponse,
        decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void
    ) {
        if response.isForMainFrame,
           let http = response.response as? HTTPURLResponse,
           !(200..<400).contains(http.statusCode) {
            decisionHandler(.cancel)
            showFailure()
        } else {
            decisionHandler(.allow)
        }
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        activeNavigation = navigation
        hasFailed = false
        isLoading = true
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard navigation === activeNavigation else { return }
        applySafeAreaInsets()
        isLoading = false
        activeNavigation = nil
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        handleFailure(navigation, error)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        handleFailure(navigation, error)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        showFailure()
    }

    func webView(
        _ webView: WKWebView,
        requestDeviceOrientationAndMotionPermissionFor origin: WKSecurityOrigin,
        initiatedByFrame frame: WKFrameInfo,
        decisionHandler: @escaping (WKPermissionDecision) -> Void
    ) {
        let allowed = frame.isMainFrame && Self.isAppURL(frame.request.url)
        decisionHandler(allowed ? .prompt : .deny)
    }

    @available(iOS 27.0, *)
    func webView(
        _ webView: WKWebView,
        requestGeolocationPermissionFor origin: WKSecurityOrigin,
        initiatedByFrame frame: WKFrameInfo,
        decisionHandler: @escaping (WKPermissionDecision) -> Void
    ) {
        let allowed = frame.isMainFrame && Self.isAppURL(frame.request.url) &&
            origin.protocol == "https" && origin.host == Self.origin.host &&
            (origin.port == 0 || origin.port == 443)
        // 기기의 앱 위치 권한은 iOS가 별도로 확인해요.
        decisionHandler(allowed ? .grant : .deny)
    }

    private static func isAppURL(_ url: URL?) -> Bool {
        guard let url else { return false }
        return url.scheme == "https" && url.host == origin.host && (url.port == nil || url.port == 443)
    }

    private func handleFailure(_ navigation: WKNavigation?, _ error: Error) {
        guard navigation === activeNavigation else { return }
        let error = error as NSError
        if error.domain == NSURLErrorDomain && error.code == NSURLErrorCancelled {
            activeNavigation = nil
            isLoading = false
        } else {
            showFailure()
        }
    }

    private func showFailure() {
        activeNavigation = nil
        isLoading = false
        hasFailed = true
    }
}
