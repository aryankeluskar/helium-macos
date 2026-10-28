import AppKit
import ApplicationServices

func attribute(_ element: AXUIElement, _ name: String) -> AnyObject? {
  var value: AnyObject?
  return AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success ? value : nil
}

func frame(_ element: AXUIElement) -> CGRect? {
  var origin = CGPoint.zero
  var size = CGSize.zero
  guard let position = attribute(element, kAXPositionAttribute),
    let extent = attribute(element, kAXSizeAttribute),
    AXValueGetValue(position as! AXValue, .cgPoint, &origin),
    AXValueGetValue(extent as! AXValue, .cgSize, &size)
  else { return nil }
  return CGRect(origin: origin, size: size)
}

func findButton(_ element: AXUIElement, titled title: String, depth: Int = 0) -> AXUIElement? {
  let role = attribute(element, kAXRoleAttribute) as? String
  if depth > 30 || role == "AXWebArea" { return nil }
  if role == kAXButtonRole as String,
    (attribute(element, kAXTitleAttribute) as? String) == title
      || (attribute(element, kAXDescriptionAttribute) as? String) == title
  {
    return element
  }
  for child in (attribute(element, kAXChildrenAttribute) as? [AXUIElement]) ?? [] {
    if let found = findButton(child, titled: title, depth: depth + 1) { return found }
  }
  return nil
}

func findWebArea(_ element: AXUIElement, depth: Int = 0) -> AXUIElement? {
  if depth > 40 { return nil }
  if (attribute(element, kAXRoleAttribute) as? String) == "AXWebArea" { return element }
  for child in (attribute(element, kAXChildrenAttribute) as? [AXUIElement]) ?? [] {
    if let found = findWebArea(child, depth: depth + 1) { return found }
  }
  return nil
}

func dump(_ element: AXUIElement, depth: Int = 0) {
  if depth > 40 { return }
  let role = attribute(element, kAXRoleAttribute) as? String ?? "?"
  let label = [kAXTitleAttribute, kAXDescriptionAttribute, kAXValueAttribute]
    .compactMap { attribute(element, $0) as? String }
    .filter { !$0.isEmpty }
    .joined(separator: " | ")
  let rect = frame(element).map { "\(Int($0.minX)),\(Int($0.minY)) \(Int($0.width))x\(Int($0.height))" } ?? ""
  print("\(String(repeating: "  ", count: depth))\(role) [\(rect)] \(label)")
  if role == "AXWebArea" { return }
  for child in (attribute(element, kAXChildrenAttribute) as? [AXUIElement]) ?? [] {
    dump(child, depth: depth + 1)
  }
}

let arguments = CommandLine.arguments
guard arguments.count >= 3,
  let app = NSWorkspace.shared.runningApplications.first(where: { $0.localizedName == arguments[2] })
else {
  print("usage: ax press <app name> <button title> [seconds] | ax webarea <app name> | ax dump <app name>")
  exit(64)
}
let root = AXUIElementCreateApplication(app.processIdentifier)
let windows = { (attribute(root, kAXWindowsAttribute) as? [AXUIElement]) ?? [] }

switch arguments[1] {
case "press":
  guard arguments.count >= 4 else { exit(64) }
  let deadline = Date().addingTimeInterval(arguments.count > 4 ? Double(arguments[4])! : 20)
  while Date() < deadline {
    for window in windows() {
      if let button = findButton(window, titled: arguments[3]) {
        exit(AXUIElementPerformAction(button, kAXPressAction as CFString) == .success ? 0 : 2)
      }
    }
    usleep(500_000)
  }
  exit(1)
case "webarea":
  let deadline = Date().addingTimeInterval(15)
  while Date() < deadline {
    for window in windows() {
      if let area = findWebArea(window), let rect = frame(area), rect.width > 100 {
        print(Int(rect.minX), Int(rect.minY), Int(rect.width), Int(rect.height))
        exit(0)
      }
    }
    usleep(500_000)
  }
  exit(1)
case "dump":
  for window in windows() {
    print("window \(attribute(window, kAXTitleAttribute) as? String ?? "")")
    dump(window, depth: 1)
  }
default:
  exit(64)
}
