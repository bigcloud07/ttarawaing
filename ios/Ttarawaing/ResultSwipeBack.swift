import UIKit
import WebKit

/// 결과 화면에서 왼쪽 끝을 밀면 iOS 내비게이션처럼 결과 화면이 손가락을 따라 밀려나고 검색 화면이 드러난다.
/// 웹은 결과 화면에서 방문 기록을 남기지 않아 WebView 기본 스와이프로는 검색 화면에 돌아갈 수 없다.
@MainActor
final class ResultSwipeBack: NSObject, UIGestureRecognizerDelegate, WKScriptMessageHandler {
    let container = TouchReportingView()

    private let webView: WKWebView
    private var isShowingResult = false
    private var searchScreen: (image: UIImage, scrollY: CGFloat, takenAt: CFTimeInterval)?
    private var isCapturingSearchScreen = false
    private var underlay: UIView?
    private let dimming = UIView()

    private static let resultMessage = "resultScreen"
    private static let backControl = ".app-result-navigation a"
    private static let snapshotScale: CGFloat = 0.5
    private static let snapshotLifetime: CFTimeInterval = 1

    init(webView: WKWebView) {
        self.webView = webView
        super.init()

        webView.frame = container.bounds
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        container.addSubview(webView)
        container.onTouch = { [weak self] in self?.captureSearchScreen() }

        let pan = UIScreenEdgePanGestureRecognizer(target: self, action: #selector(pan(_:)))
        pan.edges = .left
        pan.delegate = self
        container.addGestureRecognizer(pan)

        dimming.backgroundColor = .black
        webView.layer.shadowColor = UIColor.black.cgColor
        webView.layer.shadowRadius = 10
        webView.layer.shadowOffset = CGSize(width: -3, height: 0)

        let controller = webView.configuration.userContentController
        controller.add(self, name: Self.resultMessage)
        controller.addUserScript(WKUserScript(
            source: """
            (() => {
                let showing = null;
                let watched = null;
                const report = () => {
                    const next = Boolean(document.querySelector('\(Self.backControl)'));
                    if (next !== showing) {
                        showing = next;
                        window.webkit.messageHandlers.\(Self.resultMessage).postMessage(next);
                    }
                };
                const observer = new MutationObserver(() => { watch(); report(); });
                const watch = () => {
                    const shell = document.querySelector('main.app-shell');
                    if (shell === watched) return;
                    watched = shell;
                    observer.disconnect();
                    if (!shell) {
                        observer.observe(document.body, { childList: true, subtree: true });
                        return;
                    }
                    for (let node = shell; node && node !== document.documentElement; node = node.parentNode) {
                        observer.observe(node, { childList: true });
                    }
                };
                watch();
                report();
            })();
            """,
            injectionTime: .atDocumentEnd,
            forMainFrameOnly: true
        ))
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        isShowingResult = message.body as? Bool == true
    }

    private func isSearchScreenCurrent(scrollY: CGFloat, now: CFTimeInterval) -> Bool {
        guard let searchScreen else { return false }
        return searchScreen.scrollY == scrollY && now - searchScreen.takenAt < Self.snapshotLifetime
    }

    private func captureSearchScreen() {
        guard !isShowingResult, !isCapturingSearchScreen, underlay == nil else { return }
        let scrollY = webView.scrollView.contentOffset.y
        let now = CACurrentMediaTime()
        if isSearchScreenCurrent(scrollY: scrollY, now: now) { return }
        isCapturingSearchScreen = true
        let configuration = WKSnapshotConfiguration()
        configuration.snapshotWidth = NSNumber(value: Double(webView.bounds.width * Self.snapshotScale))
        webView.takeSnapshot(with: configuration) { [weak self] image, _ in
            guard let self else { return }
            isCapturingSearchScreen = false
            if let image, !isShowingResult { searchScreen = (image, scrollY, now) }
        }
    }

    func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        isShowingResult && underlay == nil && !webView.canGoBack
    }

    // 지도처럼 터치를 직접 처리하는 웹 요소보다 가장자리 스와이프가 먼저 판단되게 한다.
    func gestureRecognizer(
        _ gestureRecognizer: UIGestureRecognizer,
        shouldBeRequiredToFailBy otherGestureRecognizer: UIGestureRecognizer
    ) -> Bool {
        otherGestureRecognizer.view?.isDescendant(of: webView) == true
    }

    @objc private func pan(_ gesture: UIScreenEdgePanGestureRecognizer) {
        let width = container.bounds.width
        let progress = min(max(gesture.translation(in: container).x / width, 0), 1)

        switch gesture.state {
        case .began:
            showUnderlay()
            move(to: progress)
        case .changed:
            move(to: progress)
        case .ended, .cancelled, .failed:
            let velocity = gesture.velocity(in: container).x
            let completes = gesture.state == .ended && (velocity > 300 || (progress > 0.5 && velocity > -300))
            settle(from: progress, completing: completes, velocity: velocity)
        default:
            break
        }
    }

    private func showUnderlay() {
        let underlay = UIImageView(image: searchScreen?.image)
        underlay.frame = container.bounds
        underlay.backgroundColor = .white
        underlay.contentMode = .scaleToFill
        underlay.clipsToBounds = true
        dimming.frame = underlay.bounds
        underlay.addSubview(dimming)
        container.insertSubview(underlay, belowSubview: webView)
        webView.layer.shadowOpacity = 0.18
        self.underlay = underlay
    }

    private func move(to progress: CGFloat) {
        let width = container.bounds.width
        webView.transform = CGAffineTransform(translationX: width * progress, y: 0)
        underlay?.transform = CGAffineTransform(translationX: -width * 0.3 * (1 - progress), y: 0)
        dimming.alpha = 0.12 * (1 - progress)
        webView.layer.shadowOpacity = Float(0.18 * (1 - progress))
    }

    private func settle(from progress: CGFloat, completing: Bool, velocity: CGFloat) {
        let target: CGFloat = completing ? 1 : 0
        let distance = abs(target - progress) * container.bounds.width
        let springVelocity = distance > 1 ? abs(velocity) / distance : 0
        UIView.animate(
            withDuration: completing ? 0.32 : 0.28,
            delay: 0,
            usingSpringWithDamping: 1,
            initialSpringVelocity: springVelocity,
            options: [.allowUserInteraction, .curveEaseOut]
        ) {
            self.move(to: target)
        } completion: { _ in
            if completing {
                self.goBackBehindUnderlay()
            } else {
                self.removeUnderlay()
            }
        }
    }

    // 검색 화면 사진으로 덮은 채 실제 뒤로가기를 실행하고, 웹이 그린 뒤 사진을 걷어 낸다.
    private func goBackBehindUnderlay() {
        guard let underlay else { return }
        container.bringSubviewToFront(underlay)
        webView.transform = .identity
        webView.layer.shadowOpacity = 0
        webView.callAsyncJavaScript(
            """
            const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            document.querySelector('\(Self.backControl)')?.click();
            await nextFrame();
            window.scrollTo(0, scrollY);
            await nextFrame();
            """,
            arguments: ["scrollY": searchScreen?.scrollY ?? 0],
            in: nil,
            in: .page
        ) { _ in
            UIView.animate(withDuration: 0.12) {
                underlay.alpha = 0
            } completion: { _ in
                self.removeUnderlay()
            }
        }
    }

    private func removeUnderlay() {
        webView.transform = .identity
        webView.layer.shadowOpacity = 0
        underlay?.removeFromSuperview()
        underlay = nil
    }
}

final class TouchReportingView: UIView {
    var onTouch: (() -> Void)?

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        if event?.type == .touches { onTouch?() }
        return super.hitTest(point, with: event)
    }
}
