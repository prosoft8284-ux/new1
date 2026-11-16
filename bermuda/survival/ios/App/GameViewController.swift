import UIKit
import WebKit

/// Fullscreen WKWebView host for the same web build the Android app ships.
/// The game is bundled as the blue "www" folder in the app resources, so it
/// runs completely offline with no server and no network permission.
final class GameViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {

  private var webView: WKWebView!
  private var splash: UIView!
  private var errorLabel: UILabel!
  private var retried = false
  private let impact = UIImpactFeedbackGenerator(style: .light)

  override var prefersStatusBarHidden: Bool { true }
  override var prefersHomeIndicatorAutoHidden: Bool { true }
  override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .landscape }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .black

    let config = WKWebViewConfiguration()
    config.allowsInlineMediaPlayback = true
    config.mediaTypesRequiringUserActionForPlayback = []
    config.defaultWebpagePreferences.allowsContentJavaScript = true

    // Bridge shared with the Android build + native haptics, because iOS
    // Safari/WKWebView does not implement navigator.vibrate.
    let bridge = """
    window.__ios = true;
    window.__onBack = function (fn) { window.__iosBackHandler = fn; };
    try {
      navigator.vibrate = function (ms) {
        try { window.webkit.messageHandlers.haptic.postMessage(ms || 18); } catch (e) {}
        return true;
      };
    } catch (e) {}
    """
    config.userContentController.addUserScript(
      WKUserScript(source: bridge, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    config.userContentController.add(self, name: "back")
    config.userContentController.add(self, name: "haptic")

    webView = WKWebView(frame: .zero, configuration: config)
    webView.navigationDelegate = self
    webView.uiDelegate = self
    webView.isOpaque = false
    webView.backgroundColor = .black
    webView.scrollView.isScrollEnabled = false
    webView.scrollView.bounces = false
    webView.scrollView.contentInsetAdjustmentBehavior = .never
    webView.allowsBackForwardNavigationGestures = false
    webView.allowsLinkPreview = false
    webView.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(webView)
    NSLayoutConstraint.activate([
      webView.topAnchor.constraint(equalTo: view.topAnchor),
      webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
      webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      webView.trailingAnchor.constraint(equalTo: view.trailingAnchor)
    ])

    splash = makeSplash()
    view.addSubview(splash)
    splash.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([
      splash.topAnchor.constraint(equalTo: view.topAnchor),
      splash.bottomAnchor.constraint(equalTo: view.bottomAnchor),
      splash.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      splash.trailingAnchor.constraint(equalTo: view.trailingAnchor)
    ])

    loadGame()
  }

  // MARK: - loading

  private func loadGame() {
    guard let dir = Bundle.main.url(forResource: "www", withExtension: nil) else {
      fail("پوشهٔ www داخل بستهٔ برنامه نیست.\nاسکریپت ios/sync-www.sh را اجرا و دوباره Build کنید.")
      return
    }
    let index = dir.appendingPathComponent("index.html")
    guard FileManager.default.fileExists(atPath: index.path) else {
      fail("فایل index.html پیدا نشد.\nاسکریپت ios/sync-www.sh را اجرا کنید.")
      return
    }
    webView.loadFileURL(index, allowingReadAccessTo: dir)
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    UIView.animate(withDuration: 0.35) { self.splash.alpha = 0 }
  }

  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
    // One silent retry covers a first-launch race with the bundled file read.
    if !retried {
      retried = true
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { self.loadGame() }
    } else {
      fail("بارگذاری بازی ناموفق بود:\n\(error.localizedDescription)")
    }
  }

  // MARK: - JS bridge

  func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
    if message.name == "haptic" {
      impact.prepare()
      impact.impactOccurred()
    } else if message.name == "back" {
      webView.evaluateJavaScript(
        "window.__iosBackHandler ? (window.__iosBackHandler(), true) : false") { result, _ in
        if let handled = result as? Bool, !handled {
          // Nothing to go back to; iOS has no hardware back key, so do nothing.
        }
      }
    }
  }

  // MARK: - chrome

  private func makeSplash() -> UIView {
    let box = UIView()
    box.backgroundColor = UIColor(red: 0.02, green: 0.12, blue: 0.20, alpha: 1)

    let label = UILabel()
    label.text = "BERMUDA SURVIVAL"
    label.textColor = UIColor(red: 0.55, green: 0.92, blue: 0.98, alpha: 1)
    label.font = UIFont.monospacedSystemFont(ofSize: 24, weight: .bold)
    label.textAlignment = .center
    label.translatesAutoresizingMaskIntoConstraints = false

    let spinner = UIActivityIndicatorView(style: .large)
    spinner.color = label.textColor
    spinner.startAnimating()
    spinner.translatesAutoresizingMaskIntoConstraints = false

    let sub = UILabel()
    sub.text = "در حال بازسازی جزیره…"
    sub.textColor = .white
    sub.font = UIFont.systemFont(ofSize: 15, weight: .regular)
    sub.textAlignment = .center
    sub.translatesAutoresizingMaskIntoConstraints = false

    box.addSubview(label); box.addSubview(spinner); box.addSubview(sub)
    NSLayoutConstraint.activate([
      label.centerXAnchor.constraint(equalTo: box.centerXAnchor),
      label.centerYAnchor.constraint(equalTo: box.centerYAnchor, constant: -40),
      spinner.centerXAnchor.constraint(equalTo: box.centerXAnchor),
      spinner.topAnchor.constraint(equalTo: label.bottomAnchor, constant: 22),
      sub.centerXAnchor.constraint(equalTo: box.centerXAnchor),
      sub.topAnchor.constraint(equalTo: spinner.bottomAnchor, constant: 18)
    ])
    return box
  }

  private func fail(_ text: String) {
    splash.alpha = 1
    errorLabel?.removeFromSuperview()
    let label = UILabel()
    label.text = text
    label.numberOfLines = 0
    label.textAlignment = .center
    label.textColor = .white
    label.font = UIFont.systemFont(ofSize: 16)
    label.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(label)
    NSLayoutConstraint.activate([
      label.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      label.centerYAnchor.constraint(equalTo: view.centerYAnchor),
      label.widthAnchor.constraint(lessThanOrEqualTo: view.widthAnchor, multiplier: 0.8)
    ])
    errorLabel = label
  }
}
