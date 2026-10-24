// Vibeset owns this provider; Expo still owns the isolated SwiftUI layout and storage.
// Each WidgetKit request derives fresh dates. Cached app timeline dates are never reused.
import Foundation

struct VibesetCalendarEntry: TimelineEntry {
  let date: Date
  let props: [String: Any]?
}

struct VibesetCalendarProvider: TimelineProvider {
  private let name = "VibesetCalendar"

  private func selection() -> [String: Any]? {
    let initial = WidgetsLayoutRegistry.initialProps(for: name)
    guard let entries = WidgetsStorage.getArray(forKey: "__expo_widgets_\(name)_timeline"),
          entries.count <= 52,
          let entry = entries.first as? [String: Any],
          let props = entry["props"] as? [String: Any],
          props["active"] is Bool,
          let locale = props["locale"] as? String,
          ["en", "ar"].contains(locale),
          let encoded = try? JSONSerialization.data(withJSONObject: props),
          encoded.count <= 16_384 else { return initial }
    let paints = ["surface", "ink", "accent", "accentInk"]
    guard paints.allSatisfy({ key in
      guard let value = props[key] as? String else { return false }
      return value.utf16.count == 7
        && value.range(of: "^#[0-9a-fA-F]{6}$", options: .regularExpression) != nil
    }),
    let radius = props["radius"] as? Double, (0...0.5).contains(radius),
    let design = props["fontDesign"] as? String,
    ["default", "rounded", "serif", "monospaced"].contains(design),
    ["themeName", "emptyTitle", "emptyDescription"].allSatisfy({ key in
      guard let value = props[key] as? String else { return false }
      return value.utf16.count <= 160
    }) else { return initial }
    if props["active"] as? Bool == true {
      guard let id = props["themeId"] as? String, UUID(uuidString: id) != nil else { return initial }
    }
    return props
  }

  private func entry(at date: Date, selection: [String: Any]?) -> VibesetCalendarEntry {
    guard var props = selection, props["active"] as? Bool == true else {
      return VibesetCalendarEntry(date: date, props: selection)
    }
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = .current
    calendar.firstWeekday = 2
    let language = props["locale"] as? String == "ar"
      ? "ar-u-ca-gregory-nu-latn" : "en-GB-u-ca-gregory-nu-latn"
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: language)
    formatter.calendar = calendar
    formatter.timeZone = calendar.timeZone
    func label(_ format: String, _ value: Date = date) -> String {
      formatter.dateFormat = format
      return formatter.string(from: value)
    }
    props["monthLabel"] = label("LLLL yyyy")
    props["weekdayLabel"] = label("EEEE")
    props["dayLabel"] = label("d")
    formatter.setLocalizedDateFormatFromTemplate("EEEE d MMMM yyyy")
    props["dateLabel"] = formatter.string(from: date)
    // Keep the same Monday-first six-week Gregorian grid as the app preview.
    let monthStart = calendar.date(from: calendar.dateComponents([.year, .month], from: date))
      ?? calendar.startOfDay(for: date)
    let offset = (calendar.component(.weekday, from: monthStart) + 5) % 7
    let gridStart = calendar.date(byAdding: .day, value: -offset, to: monthStart) ?? monthStart
    props["weekdays"] = (0..<7).map { index in
      label("EEEEE", calendar.date(byAdding: .day, value: index, to: gridStart) ?? gridStart)
    }
    props["cells"] = (0..<42).map { index -> [String: Any] in
      let cell = calendar.date(byAdding: .day, value: index, to: gridStart) ?? gridStart
      return [
        "label": label("d", cell),
        "today": calendar.isDate(cell, inSameDayAs: date),
        "inMonth": calendar.isDate(cell, equalTo: date, toGranularity: .month)
      ]
    }
    // Subtract wall-clock fields rather than elapsed time since midnight: DST days
    // can be 23/25 hours. Half-hour entries re-anchor the native timer after a jump.
    let fields = calendar.dateComponents([.hour, .minute, .second, .nanosecond], from: date)
    let seconds = Double((fields.hour ?? 0) * 3600 + (fields.minute ?? 0) * 60 + (fields.second ?? 0))
      + Double(fields.nanosecond ?? 0) / 1_000_000_000
    let anchor = floor((date.timeIntervalSince1970 - seconds) * 1000)
    props["clockAnchor"] = anchor
    props["clockEnd"] = anchor + 86_400_000
    return VibesetCalendarEntry(date: date, props: props)
  }

  func placeholder(in context: Context) -> VibesetCalendarEntry {
    entry(at: Date(), selection: WidgetsLayoutRegistry.initialProps(for: name))
  }

  func getSnapshot(in context: Context, completion: @escaping @Sendable (VibesetCalendarEntry) -> Void) {
    completion(entry(at: Date(), selection: selection()))
  }

  func getTimeline(in context: Context, completion: @escaping @Sendable (Timeline<VibesetCalendarEntry>) -> Void) {
    let now = Date()
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = .current
    let nextMidnight = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: now))
      ?? now.addingTimeInterval(86_400)
    let end = now.addingTimeInterval(86_400)
    var times = Set([now.timeIntervalSince1970])
    var next = (floor(now.timeIntervalSince1970 / 1800) + 1) * 1800
    while next <= end.timeIntervalSince1970 && times.count < 50 {
      times.insert(next)
      next += 1800
    }
    // Exact local midnights also cover quarter-hour zones and DST boundaries.
    for offset in 1...2 {
      if let midnight = calendar.date(byAdding: .day, value: offset, to: calendar.startOfDay(for: now)),
         midnight > now, midnight <= end {
        times.insert(midnight.timeIntervalSince1970)
      }
    }
    let selected = selection()
    let entries = times.sorted().prefix(52).map {
      entry(at: Date(timeIntervalSince1970: $0), selection: selected)
    }
    // WidgetKit decides delivery time. This asks the extension, not the app, to
    // regenerate another bounded timeline; future calendar days cannot freeze.
    completion(Timeline(entries: entries, policy: .after(nextMidnight)))
  }
}

struct VibesetCalendarEntryView: View {
  @Environment(\.self) private var environment
  let entry: VibesetCalendarEntry

  private var widgetEnvironment: [String: Any] {
    var env = getWidgetEnvironment(environment: environment)
    env["timestamp"] = Int(entry.date.timeIntervalSince1970 * 1000)
    return env
  }

  var body: some View {
    if let layout = WidgetsLayoutRegistry.layout(for: "VibesetCalendar"), let props = entry.props {
      let node = evaluateLayout(layout: layout, props: props, environment: widgetEnvironment)
      WidgetsDynamicView(name: "VibesetCalendar", kind: .widget, node: node)
        .environment(\.layoutDirection, props["locale"] as? String == "ar" ? .rightToLeft : .leftToRight)
    } else {
      EmptyWidgetView()
    }
  }
}
