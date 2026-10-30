"""Tema oscuro con acento rojo (igual que la app de Android)."""

ACCENT = "#f2323f"
ACCENT_HOVER = "#ff4d58"
BG = "#121214"
PANEL = "#1e1e24"
PANEL2 = "#25252b"
LINE = "#2d2d35"
MUTED = "#8b8b97"
TEXT = "#e8e8ee"

CLIP_COLORS = {
    "video": ("#5a2530", "#a03d4d"),
    "image": ("#2a4d3f", "#3f7a62"),
    "audio": ("#5e5018", "#a8922e"),
    "text": ("#4d3a73", "#7459ad"),
    "effect": ("#1f4a5c", "#3b8fb0"),
}

QSS = f"""
* {{ font-size: 13px; }}
QWidget {{ background: {BG}; color: {TEXT}; }}
QMainWindow, QDialog {{ background: {BG}; }}
QLabel {{ background: transparent; }}
QFrame#panel, QWidget#panel {{ background: {PANEL}; }}
QToolTip {{ background: {PANEL2}; color: {TEXT}; border: 1px solid {LINE}; padding: 4px; }}
QPushButton {{ background: {PANEL2}; border: 1px solid {LINE}; border-radius: 6px; padding: 6px 12px; }}
QPushButton:hover {{ background: #2f2f37; }}
QPushButton:disabled {{ color: #5a5a64; }}
QPushButton#accent {{ background: {ACCENT}; border: none; color: white; font-weight: 600; }}
QPushButton#accent:hover {{ background: {ACCENT_HOVER}; }}
QPushButton#accent:disabled {{ background: #5a2a30; color: #aaa; }}
QToolButton {{ background: transparent; border: none; border-radius: 6px; padding: 5px; }}
QToolButton:hover {{ background: #2f2f37; }}
QToolButton:checked {{ background: #4a1f25; color: {ACCENT_HOVER}; }}
QLineEdit, QPlainTextEdit, QSpinBox, QDoubleSpinBox, QComboBox {{
    background: {BG}; border: 1px solid {LINE}; border-radius: 5px; padding: 3px 6px; selection-background-color: {ACCENT};
}}
QLineEdit:focus, QPlainTextEdit:focus, QSpinBox:focus, QDoubleSpinBox:focus, QComboBox:focus {{ border-color: {ACCENT}; }}
QComboBox QAbstractItemView {{ background: {PANEL2}; selection-background-color: {ACCENT}; border: 1px solid {LINE}; }}
QComboBox::drop-down {{ border: none; width: 18px; }}
QTabBar::tab {{ background: transparent; padding: 8px 12px; color: {MUTED}; border-bottom: 2px solid transparent; }}
QTabBar::tab:selected {{ color: {ACCENT_HOVER}; border-bottom: 2px solid {ACCENT}; }}
QTabWidget::pane {{ border: none; background: {PANEL}; }}
QSlider::groove:horizontal {{ height: 4px; background: #3a3a44; border-radius: 2px; }}
QSlider::sub-page:horizontal {{ background: {ACCENT}; border-radius: 2px; }}
QSlider::handle:horizontal {{ width: 14px; height: 14px; margin: -5px 0; border-radius: 7px; background: white; }}
QScrollBar:vertical {{ background: transparent; width: 10px; }}
QScrollBar::handle:vertical {{ background: #3a3a44; border-radius: 5px; min-height: 24px; }}
QScrollBar:horizontal {{ background: transparent; height: 10px; }}
QScrollBar::handle:horizontal {{ background: #3a3a44; border-radius: 5px; min-width: 24px; }}
QScrollBar::add-line, QScrollBar::sub-line {{ width: 0; height: 0; }}
QListWidget {{ background: {PANEL}; border: none; outline: none; }}
QListWidget::item {{ border-radius: 8px; padding: 4px; }}
QListWidget::item:selected {{ background: #4a1f25; }}
QListWidget::item:hover {{ background: #2a2a31; }}
QMenu {{ background: {PANEL2}; border: 1px solid {LINE}; padding: 4px; }}
QMenu::item {{ padding: 6px 18px; border-radius: 4px; }}
QMenu::item:selected {{ background: {ACCENT}; }}
QProgressBar {{ background: #2d2d35; border: none; border-radius: 4px; height: 8px; text-align: center; color: transparent; }}
QProgressBar::chunk {{ background: {ACCENT}; border-radius: 4px; }}
QCheckBox::indicator {{ width: 16px; height: 16px; border-radius: 4px; border: 1px solid #4a4a55; background: {BG}; }}
QCheckBox::indicator:checked {{ background: {ACCENT}; border-color: {ACCENT}; }}
QSplitter::handle {{ background: {LINE}; }}
"""
