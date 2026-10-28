import AppKit
import ApplicationServices

func attribute(_ element: AXUIElement, _ name: String) -> AnyObject? {
  var value: AnyObject?
  return AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success ? value : nil
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

let arguments = CommandLine.arguments
guard arguments.count >= 4, arguments[1] == "press" else {
  print("usage: ax press <app name> <button title> [seconds]")
  exit(64)
}
guard
  let app = NSWorkspace.shared.runningApplications.first(where: { $0.localizedName == arguments[2] })
else { exit(1) }
let root = AXUIElementCreateApplication(app.processIdentifier)
let deadline = Date().addingTimeInterval(arguments.count > 4 ? Double(arguments[4])! : 20)
while Date() < deadline {
  for window in (attribute(root, kAXWindowsAttribute) as? [AXUIElement]) ?? [] {
    if let button = findButton(window, titled: arguments[3]) {
      exit(AXUIElementPerformAction(button, kAXPressAction as CFString) == .success ? 0 : 2)
    }
  }
  usleep(500_000)
}
exit(1)
