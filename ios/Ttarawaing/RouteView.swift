import SwiftUI
import WebKit

struct RouteView: View {
    @StateObject private var browser = RouteBrowser()

    var body: some View {
        WebView(webView: browser.webView)
            .accessibilityHidden(browser.hasFailed)
            .overlay {
                if browser.hasFailed {
                    ContentUnavailableView {
                        Label("경로 화면을 열 수 없어요", systemImage: "wifi.exclamationmark")
                    } description: {
                        Text("인터넷 연결을 확인해 주세요. 대여소는 오프라인에서도 찾을 수 있어요.")
                    } actions: {
                        VStack(spacing: 12) {
                            Button("다시 시도") { browser.load() }
                                .buttonStyle(.borderedProminent)
                            Button("오프라인 대여소 찾기") { browser.showsOfflineStations = true }
                                .buttonStyle(.bordered)
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
            .sheet(isPresented: $browser.showsOfflineStations) {
                OfflineStationsView()
            }
    }
}

private struct WebView: UIViewRepresentable {
    let webView: WKWebView

    func makeUIView(context: Context) -> WKWebView { webView }

    func updateUIView(_ webView: WKWebView, context: Context) {}
}

@MainActor
final class RouteBrowser: NSObject, ObservableObject, WKNavigationDelegate, WKUIDelegate {
    private static let origin = URL(string: "https://ttarawaing.vercel.app")!
    private static let rental = URL(string: "bikeseoul://action")!
    private static let rentalStore = URL(string: "https://apps.apple.com/kr/app/id1037272004")!
    private static let offlineStations = URL(string: "ttarawaing://offline-stations")!

    let webView: WKWebView
    @Published private(set) var isLoading = true
    @Published private(set) var hasFailed = false
    @Published var showsOfflineStations = false
    private var activeNavigation: WKNavigation?

    override init() {
        let configuration = WKWebViewConfiguration()
        configuration.applicationNameForUserAgent = "TtarawaingApp/iOS TtarawaingOfflineStations/1"
        webView = WKWebView(frame: .zero, configuration: configuration)
        super.init()
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        #if DEBUG
        webView.isInspectable = true
        #endif
        load()
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

        if url == Self.offlineStations && action.navigationType == .linkActivated {
            showsOfflineStations = true
        } else if url == Self.rental {
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
