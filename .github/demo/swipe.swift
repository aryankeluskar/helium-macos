import AppKit
import CoreGraphics
import Foundation

func post(_ event: CGEvent?, flags: CGEventFlags = []) {
  event?.flags = flags
  event?.post(tap: .cghidEventTap)
}

func scroll(
  _ deltaX: Int32, phase: Int64, at point: CGPoint, time: CGEventTimestamp, momentum: Int64 = 0
) {
  let event = CGEvent(
    scrollWheelEvent2Source: nil, units: .pixel, wheelCount: 2, wheel1: 0,
    wheel2: deltaX, wheel3: 0)
  event?.location = point
  event?.timestamp = time
  event?.setIntegerValueField(.scrollWheelEventIsContinuous, value: 1)
  event?.setIntegerValueField(.scrollWheelEventScrollPhase, value: phase)
  event?.setIntegerValueField(.scrollWheelEventMomentumPhase, value: momentum)
  post(event)
}

func moveMouse(to point: CGPoint) {
  post(
    CGEvent(
      mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: point,
      mouseButton: .left))
}

func click(at point: CGPoint, right: Bool) {
  moveMouse(to: point)
  usleep(80_000)
  let button: CGMouseButton = right ? .right : .left
  for type in right ? [CGEventType.rightMouseDown, .rightMouseUp] : [.leftMouseDown, .leftMouseUp] {
    let event = CGEvent(
      mouseEventSource: nil, mouseType: type, mouseCursorPosition: point, mouseButton: button)
    event?.setIntegerValueField(.mouseEventClickState, value: 1)
    post(event)
    usleep(60_000)
  }
}

let modifiers: [String: (flag: CGEventFlags, key: CGKeyCode)] = [
  "ctrl": (.maskControl, 59), "cmd": (.maskCommand, 55), "shift": (.maskShift, 56),
  "alt": (.maskAlternate, 58),
]

func setModifier(_ name: String, down: Bool, flags: CGEventFlags) {
  guard let modifier = modifiers[name],
    let event = CGEvent(keyboardEventSource: nil, virtualKey: modifier.key, keyDown: down)
  else { return }
  event.type = .flagsChanged
  post(event, flags: flags)
  usleep(20_000)
}

func key(_ code: CGKeyCode, holding names: [String], hold: Double = 0.03) {
  var flags = CGEventFlags()
  for name in names {
    flags.insert(modifiers[name]?.flag ?? [])
    setModifier(name, down: true, flags: flags)
  }
  for down in [true, false] {
    post(CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: down), flags: flags)
    usleep(useconds_t((down ? hold : 0.03) * 1_000_000))
  }
  for name in names.reversed() {
    flags.remove(modifiers[name]?.flag ?? [])
    setModifier(name, down: false, flags: flags)
  }
}

func typeText(_ text: String) {
  for character in text {
    let units = Array(String(character).utf16)
    for down in [true, false] {
      let event = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: down)
      event?.keyboardSetUnicodeString(stringLength: units.count, unicodeString: units)
      post(event)
      usleep(20_000)
    }
  }
}

let arguments = CommandLine.arguments
switch arguments[1] {
case "bounds":
  let windows =
    CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID)
    as? [[String: Any]] ?? []
  for window in windows {
    guard (window[kCGWindowOwnerName as String] as? String) == arguments[2],
      (window[kCGWindowLayer as String] as? Int) == 0,
      let dictionary = window[kCGWindowBounds as String] as? NSDictionary,
      let rect = CGRect(dictionaryRepresentation: dictionary as CFDictionary),
      rect.width > 400
    else { continue }
    print(Int(rect.minX), Int(rect.minY), Int(rect.width), Int(rect.height))
    exit(0)
  }
  exit(1)
case "move":
  moveMouse(to: CGPoint(x: Double(arguments[2])!, y: Double(arguments[3])!))
case "click":
  click(
    at: CGPoint(x: Double(arguments[2])!, y: Double(arguments[3])!),
    right: arguments.count > 4 && arguments[4] == "right")
case "key":
  key(CGKeyCode(arguments[2])!, holding: Array(arguments.dropFirst(3)))
case "hold":
  key(CGKeyCode(arguments[2])!, holding: Array(arguments.dropFirst(4)), hold: Double(arguments[3])!)
case "release":
  for name in modifiers.keys { setModifier(name, down: false, flags: []) }
case "type":
  typeText(arguments[2])
case "activate":
  guard
    let app = NSWorkspace.shared.runningApplications.first(where: {
      $0.localizedName == arguments[2]
    })
  else { exit(1) }
  app.activate(options: [.activateAllWindows])
case "swipe":
  let point = CGPoint(x: Double(arguments[2])!, y: Double(arguments[3])!)
  let distance = Int(arguments[4])!
  let seconds = arguments.count > 5 ? Double(arguments[5])! : 0.35
  let hold = arguments.count > 6 ? Double(arguments[6])! : 0
  moveMouse(to: point)
  usleep(150_000)
  let start = clock_gettime_nsec_np(CLOCK_UPTIME_RAW)
  let at = { (seconds: Double) in start + CGEventTimestamp(seconds * 1e9) }
  let steps = max(1, Int(seconds * 60))
  scroll(0, phase: 1, at: point, time: at(0))
  var sent = 0
  for step in 1...steps {
    let target = distance * step / steps
    scroll(Int32(target - sent), phase: 2, at: point, time: at(Double(step) / 60))
    sent = target
    usleep(16_666)
  }
  if hold > 0 {
    print("holding")
    fflush(stdout)
    usleep(useconds_t(hold * 1_000_000))
  }
  let lift = Double(steps) / 60 + hold
  scroll(0, phase: 4, at: point, time: at(lift))
  if hold == 0 {
    var delta = Double(distance) / Double(steps)
    for frame in 1...8 {
      usleep(16_666)
      delta *= 0.8
      scroll(Int32(delta.rounded()), phase: 0, at: point, time: at(lift + Double(frame) / 60), momentum: frame == 1 ? 1 : 2)
    }
    usleep(16_666)
    scroll(0, phase: 0, at: point, time: at(lift + 9 / 60), momentum: 3)
  }
default:
  exit(2)
}
