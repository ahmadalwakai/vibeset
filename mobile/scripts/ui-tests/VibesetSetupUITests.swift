import XCTest
import UIKit

/// Simulator diagnostics of the shipped UI against the real configured catalogue.
/// This never saves photos, confirms manual installation, or places a widget.
@MainActor
final class VibesetSetupUITests: XCTestCase {
  private func reveal(_ element: XCUIElement, in app: XCUIApplication, upwards: Bool = true) {
    for _ in 0..<8 {
      if element.isHittable { return }
      if upwards { app.swipeUp() } else { app.swipeDown() }
    }
    XCTAssertTrue(element.isHittable, "The real application control must be reachable")
  }

  private func capture(_ name: String) throws {
    let image = XCUIScreen.main.screenshot().image
    let data = try XCTUnwrap(image.jpegData(compressionQuality: 0.95))
    let attachment = XCTAttachment(data: data, uniformTypeIdentifier: "public.jpeg")
    attachment.name = name
    attachment.lifetime = .keepAlways
    add(attachment)
  }

  func testRealCatalogueThemeSetupScreens() throws {
    continueAfterFailure = false
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(en)", "-AppleLocale", "en_GB"]
    app.launch()
    XCTAssertTrue(app.wait(for: .runningForeground, timeout: 60))

    let setup = app.buttons["Set up this theme"].firstMatch
    XCTAssertTrue(setup.waitForExistence(timeout: 60), "A real published catalogue theme must load")
    reveal(setup, in: app)
    setup.tap()

    XCTAssertTrue(app.staticTexts["1. Your wallpaper"].waitForExistence(timeout: 60), "The real detail and validated icon pack must load")
    XCTAssertTrue(app.buttons["Save wallpaper to Photos"].exists)
    try capture("setup-wallpaper")

    let icons = app.buttons["2. Icons"]
    reveal(icons, in: app, upwards: false)
    icons.tap()
    XCTAssertTrue(app.staticTexts["2. Choose your apps"].waitForExistence(timeout: 30))
    XCTAssertTrue(app.buttons["Select all"].exists)
    for name in ["Phone", "Messages", "Camera"] {
      XCTAssertTrue(app.descendants(matching: .any).matching(identifier: name).firstMatch.waitForExistence(timeout: 30), "Real catalogue icon choices must be rendered")
    }
    try capture("setup-icons")

    let widgets = app.buttons["3. Widgets"]
    reveal(widgets, in: app, upwards: false)
    widgets.tap()
    XCTAssertTrue(app.staticTexts["3. Your live calendar"].waitForExistence(timeout: 30))
    XCTAssertTrue(app.buttons["Prepare this calendar style"].exists)
    XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label MATCHES %@", "^[0-9]{2}:[0-9]{2}$")).firstMatch.waitForExistence(timeout: 30), "The actual calendar preview must render its clock")
    try capture("setup-widget")
  }
}
