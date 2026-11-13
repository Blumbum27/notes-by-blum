import SwiftUI
import PencilKit
import Combine
import UIKit

@MainActor
final class WritingSession: ObservableObject {
    let picker: PKToolPicker = {
        let picker = PKToolPicker()
        picker.maximumSupportedContentVersion = .version2
        picker.stateAutosaveName = "Blumbum.WritingTools"
        return picker
    }()
    weak var canvas: PKCanvasView?
    var inkChanged: ((Data) -> Bool)?
    var cancelPendingRecognition: (() -> Void)?
    @Published var canUndo = false
    @Published var canRedo = false
    @Published var hasInk = false
    @Published var readOnly = false
    @Published var laserPointer = false
    @Published var hint: String?
    private var hintGeneration = 0

    func refresh() {
        canUndo = canvas?.undoManager?.canUndo ?? false
        canRedo = canvas?.undoManager?.canRedo ?? false
        hasInk = canvas?.drawing.strokes.isEmpty == false
    }
    func undo() { guard !readOnly else { return }; cancelPendingRecognition?(); hideHint(); canvas?.undoManager?.undo(); refresh() }
    func redo() { guard !readOnly else { return }; cancelPendingRecognition?(); hideHint(); canvas?.undoManager?.redo(); refresh() }
    func resume() { if !readOnly && !laserPointer { canvas?.becomeFirstResponder() } }
    func prepareForModal() { cancelPendingRecognition?(); canvas?.resignFirstResponder() }

    func usePreset(_ preset: QuickInk, width: Double) {
        guard !readOnly, let canvas else { return }
        laserPointer = false
        let tool = PKInkingTool(preset == .yellow ? .marker : .pen, color: preset.color,
                               width: preset == .yellow ? 14 : width)
        picker.selectedTool = tool
        canvas.tool = tool
        resume()
    }

    func hideHint() { hintGeneration += 1; hint = nil }

    func showHint(_ text: String, haptics: Bool) {
        hintGeneration += 1
        let generation = hintGeneration
        hint = text
        if haptics { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
        UIAccessibility.post(notification: .announcement, argument: text)
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in
            if self?.hintGeneration == generation { self?.hint = nil }
        }
    }

    /// Replace the just-completed native ink operation, rather than leaving its
    /// scribble as an extra invisible action in the undo/redo stack.
    func applyGesture(_ edit: InkGestureEdit, previous: PKDrawing, completed: PKDrawing) -> Bool {
        guard !readOnly, !laserPointer, let canvas, let manager = canvas.undoManager,
              manager.canUndo, manager.isUndoRegistrationEnabled,
              !manager.isUndoing, !manager.isRedoing, manager.groupingLevel <= 1,
              canvas.drawing.dataRepresentation() == completed.dataRepresentation(),
              let notify = inkChanged else { return false }
        manager.undo()
        guard canvas.drawing.dataRepresentation() == previous.dataRepresentation() else {
            // If UIKit grouped more than the new stroke, leave the user's drawing intact.
            if manager.canRedo { manager.redo() }
            if canvas.drawing.dataRepresentation() != completed.dataRepresentation() {
                manager.disableUndoRegistration(); canvas.drawing = completed; manager.enableUndoRegistration()
                _ = notify(completed.dataRepresentation())
            }
            refresh()
            return false
        }
        guard Self.assign(edit.drawing, to: canvas, manager: manager, actionName: edit.title, notify: notify) else {
            if manager.canRedo { manager.redo() }; refresh(); return false
        }
        refresh()
        return true
    }

    func clearInk() -> Bool {
        cancelPendingRecognition?()
        guard !readOnly, let canvas, !canvas.drawing.strokes.isEmpty,
              let manager = canvas.undoManager, manager.isUndoRegistrationEnabled,
              manager.groupingLevel <= 1, let notify = inkChanged else { return false }
        guard Self.assign(PKDrawing(), to: canvas, manager: manager, actionName: "Очистка рукописи", notify: notify) else { return false }
        hideHint(); refresh()
        return true
    }

    func insertElement(_ data: Data, pageSize: CGSize) throws -> Bool {
        cancelPendingRecognition?()
        guard !readOnly, let canvas, let manager = canvas.undoManager,
              manager.isUndoRegistrationEnabled, manager.groupingLevel <= 1, let notify = inkChanged else { return false }
        let placed = try InkElementPlacement.placed(data, on: pageSize)
        let drawing = PKDrawing(strokes: canvas.drawing.strokes + placed.strokes)
        guard drawing.dataRepresentation().count <= 30_000_000 else { throw NoteError.invalidFile }
        laserPointer = false
        guard Self.assign(drawing, to: canvas, manager: manager, actionName: "Вставка элемента", notify: notify) else { return false }
        hideHint(); refresh()
        return true
    }

    private static func assign(_ drawing: PKDrawing, to canvas: PKCanvasView, manager: UndoManager,
                               actionName: String, notify: @escaping (Data) -> Bool) -> Bool {
        let previous = canvas.drawing
        // Validate in the model before changing the visible canvas or registering history.
        guard notify(drawing.dataRepresentation()) else { return false }
        manager.disableUndoRegistration()
        canvas.drawing = drawing
        manager.enableUndoRegistration()
        let needsGroup = manager.groupingLevel == 0 && !manager.isUndoing && !manager.isRedoing
        if needsGroup { manager.beginUndoGrouping() }
        manager.registerUndo(withTarget: canvas) { [weak manager] target in
            guard let manager else { return }
            _ = Self.assign(previous, to: target, manager: manager, actionName: actionName, notify: notify)
        }
        manager.setActionName(actionName)
        if needsGroup { manager.endUndoGrouping() }
        return true
    }
}

enum QuickInk: String, CaseIterable, Identifiable {
    case black, blue, red, yellow
    var id: String { rawValue }
    var title: String {
        switch self {
        case .black: return "Чёрная ручка"
        case .blue: return "Синяя ручка"
        case .red: return "Красная ручка"
        case .yellow: return "Жёлтый маркер"
        }
    }
    var color: UIColor {
        switch self {
        case .black: return .black
        case .blue: return UIColor(red: 0.12, green: 0.33, blue: 0.75, alpha: 1)
        case .red: return UIColor(red: 0.76, green: 0.18, blue: 0.22, alpha: 1)
        case .yellow: return UIColor(red: 1, green: 0.82, blue: 0.12, alpha: 1)
        }
    }
}

struct WritingCanvas: UIViewRepresentable {
    let drawing: Data
    let size: CGSize
    let background: UIImage
    let fingerDrawing: Bool
    let scribbleErase: Bool
    let straightenLines: Bool
    let haptics: Bool
    let session: WritingSession
    let onChange: (Data) -> Bool

    func makeCoordinator() -> Coordinator { Coordinator(session: session, onChange: onChange) }

    func makeUIView(context: Context) -> PaperViewport {
        let view = PaperViewport(pageSize: size, picker: session.picker)
        view.canvas.localUndoManager.disableUndoRegistration()
        view.canvas.drawing = (try? PKDrawing(data: drawing)) ?? PKDrawing()
        view.canvas.localUndoManager.enableUndoRegistration()
        view.canvas.localUndoManager.removeAllActions()
        context.coordinator.setBaseline(view.canvas.drawing)
        view.canvas.delegate = context.coordinator
        view.canvas.undoManager?.levelsOfUndo = 40
        view.imageView.image = background
        view.canvas.drawingPolicy = fingerDrawing ? .anyInput : .pencilOnly
        view.canvas.isUserInteractionEnabled = !session.readOnly && !session.laserPointer
        view.readOnly = session.readOnly
        view.laserActive = session.laserPointer
        view.laser.isHidden = !session.laserPointer
        view.canvas.accessibilityIdentifier = "writing.canvas"
        view.scroll.panGestureRecognizer.minimumNumberOfTouches = session.laserPointer || (fingerDrawing && !session.readOnly) ? 2 : 1
        session.canvas = view.canvas
        session.inkChanged = onChange
        session.cancelPendingRecognition = { [weak coordinator = context.coordinator] in coordinator?.cancelPendingGesture() }
        DispatchQueue.main.async { session.refresh() }
        context.coordinator.configure(scribbleErase: scribbleErase, straightenLines: straightenLines, haptics: haptics)
        return view
    }

    func updateUIView(_ view: PaperViewport, context: Context) {
        // Never assign drawing during a stroke: PencilKit owns live ink until the page changes.
        view.imageView.image = background
        view.canvas.drawingPolicy = fingerDrawing ? .anyInput : .pencilOnly
        view.canvas.isUserInteractionEnabled = !session.readOnly && !session.laserPointer
        let modeChanged = view.readOnly != session.readOnly || view.laserActive != session.laserPointer
        view.readOnly = session.readOnly
        view.laserActive = session.laserPointer
        view.laser.isHidden = !session.laserPointer
        view.scroll.panGestureRecognizer.minimumNumberOfTouches = session.laserPointer || (fingerDrawing && !session.readOnly) ? 2 : 1
        if modeChanged {
            view.laser.clear()
            view.picker.setVisible(!session.readOnly && !session.laserPointer, forFirstResponder: view.canvas)
            if session.readOnly || session.laserPointer { view.canvas.resignFirstResponder() }
            else { view.canvas.becomeFirstResponder() }
        }
        context.coordinator.configure(scribbleErase: scribbleErase, straightenLines: straightenLines, haptics: haptics)
    }

    static func dismantleUIView(_ view: PaperViewport, coordinator: Coordinator) {
        coordinator.cancelPendingGesture()
        view.laser.clear()
        view.picker.setVisible(false, forFirstResponder: view.canvas)
        view.picker.removeObserver(view.canvas)
        view.canvas.resignFirstResponder()
        view.canvas.delegate = nil
        if coordinator.session.canvas === view.canvas {
            coordinator.session.canvas = nil
            coordinator.session.inkChanged = nil
            coordinator.session.cancelPendingRecognition = nil
        }
    }

    @MainActor
    final class Coordinator: NSObject, PKCanvasViewDelegate {
        let session: WritingSession
        let onChange: (Data) -> Bool
        private var lastAccepted = PKDrawing()
        private var restoring = false
        private var previous: PKDrawing?
        private var generation = 0
        private var pending: Task<Void, Never>?
        private var scribbleErase = true
        private var straightenLines = false
        private var haptics = true
        init(session: WritingSession, onChange: @escaping (Data) -> Bool) {
            self.session = session
            self.onChange = onChange
        }
        func canvasViewDrawingDidChange(_ canvasView: PKCanvasView) {
            guard !restoring else { return }
            if onChange(canvasView.drawing.dataRepresentation()) { lastAccepted = canvasView.drawing }
            else {
                // A rejected model update must never remain visible as if it were saved.
                restoring = true
                cancelPendingGesture()
                canvasView.isUserInteractionEnabled = false
                canvasView.undoManager?.disableUndoRegistration()
                canvasView.drawing = lastAccepted
                canvasView.undoManager?.enableUndoRegistration()
                canvasView.undoManager?.removeAllActions()
                canvasView.isUserInteractionEnabled = !session.readOnly && !session.laserPointer
                restoring = false
                session.showHint("Изменение не принято. Восстановлена предыдущая рукопись.", haptics: false)
            }
            DispatchQueue.main.async { [weak self] in self?.session.refresh() }
        }

        func setBaseline(_ drawing: PKDrawing) { lastAccepted = drawing }

        func configure(scribbleErase: Bool, straightenLines: Bool, haptics: Bool) {
            self.scribbleErase = scribbleErase
            self.straightenLines = straightenLines
            self.haptics = haptics
            if session.readOnly || session.laserPointer { cancelPendingGesture() }
        }

        func cancelPendingGesture() { generation += 1; pending?.cancel(); pending = nil; previous = nil }

        func canvasViewDidBeginUsingTool(_ canvasView: PKCanvasView) {
            cancelPendingGesture()
            session.hideHint()
            guard !session.readOnly, !session.laserPointer, scribbleErase || straightenLines,
                  let tool = canvasView.tool as? PKInkingTool, InkGestureProcessor.supportsGestures(tool.inkType) else { return }
            previous = canvasView.drawing
        }

        func canvasViewDidEndUsingTool(_ canvasView: PKCanvasView) {
            guard let before = previous else { return }
            previous = nil
            let token = generation
            // PencilKit finalizes pressure after touch-up; never replace a live stroke.
            pending = Task { @MainActor [weak self, weak canvasView] in
                do { try await Task.sleep(for: .milliseconds(80)) } catch { return }
                guard let self, let canvasView, self.generation == token, !self.session.readOnly, !self.session.laserPointer,
                      self.session.canvas === canvasView, canvasView.window != nil else { return }
                let completed = canvasView.drawing
                guard let edit = InkGestureProcessor.edit(previous: before, completed: completed,
                    scribbleErase: self.scribbleErase, straightenLines: self.straightenLines) else { return }
                if self.session.applyGesture(edit, previous: before, completed: completed) {
                    self.session.showHint(edit.erasedCount > 0 ? "Удалено штрихов: \(edit.erasedCount)" : "Линия выпрямлена", haptics: self.haptics)
                }
            }
        }
    }
}

/// Keep page edits separate from text fields, sheets and other pages in the window.
class WritingCanvasView: PKCanvasView {
    let localUndoManager = UndoManager()
    override var undoManager: UndoManager? { localUndoManager }
    override init(frame: CGRect) {
        super.init(frame: frame)
        maximumSupportedContentVersion = .version2
    }
    required init?(coder: NSCoder) {
        super.init(coder: coder)
        maximumSupportedContentVersion = .version2
    }
}

final class PaperViewport: UIView, UIScrollViewDelegate {
    let scroll = UIScrollView()
    let paper = UIView()
    let imageView = UIImageView()
    let canvas = WritingCanvasView()
    let laser = LaserPointerView()
    let picker: PKToolPicker
    private let pageSize: CGSize
    private var previousSize: CGSize = .zero
    var readOnly = false
    var laserActive = false

    init(pageSize: CGSize, picker: PKToolPicker) {
        self.pageSize = pageSize
        self.picker = picker
        super.init(frame: .zero)
        backgroundColor = UIColor(red: 0.89, green: 0.90, blue: 0.88, alpha: 1)
        scroll.delegate = self
        scroll.contentInsetAdjustmentBehavior = .never
        scroll.alwaysBounceVertical = true
        scroll.maximumZoomScale = 5
        scroll.minimumZoomScale = 0.1
        addSubview(scroll)
        paper.frame = CGRect(origin: .zero, size: pageSize)
        paper.backgroundColor = .white
        paper.layer.shadowColor = UIColor.black.cgColor
        paper.layer.shadowOpacity = 0.12
        paper.layer.shadowRadius = 12
        scroll.addSubview(paper)
        imageView.frame = paper.bounds
        imageView.contentMode = .scaleToFill
        paper.addSubview(imageView)
        canvas.frame = paper.bounds
        canvas.isOpaque = false
        canvas.backgroundColor = .clear
        canvas.isScrollEnabled = false
        canvas.overrideUserInterfaceStyle = .light
        // selectedTool keeps iOS 17 compatibility; newer SDKs may emit a deprecation warning.
        canvas.tool = picker.selectedTool
        paper.addSubview(canvas)
        laser.frame = paper.bounds
        laser.isHidden = true
        paper.addSubview(laser)
        scroll.contentSize = pageSize
        picker.addObserver(canvas)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        if window != nil && !readOnly && !laserActive {
            picker.setVisible(true, forFirstResponder: canvas)
            canvas.becomeFirstResponder()
        }
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        scroll.frame = bounds
        if previousSize != bounds.size && bounds.width > 0 && bounds.height > 0 {
            previousSize = bounds.size
            let fit = max(0.1, min((bounds.width - 32) / pageSize.width, (bounds.height - 64) / pageSize.height, 1.4))
            scroll.minimumZoomScale = fit
            scroll.setZoomScale(fit, animated: false)
        }
        centerPaper()
    }

    private func centerPaper() {
        let horizontal = max(16, (scroll.bounds.width - pageSize.width * scroll.zoomScale) / 2)
        let vertical = max(24, (scroll.bounds.height - pageSize.height * scroll.zoomScale) / 2)
        scroll.contentInset = UIEdgeInsets(top: vertical, left: horizontal, bottom: vertical + 70, right: horizontal)
    }

    func viewForZooming(in scrollView: UIScrollView) -> UIView? { paper }
    func scrollViewDidZoom(_ scrollView: UIScrollView) { centerPaper() }
}
