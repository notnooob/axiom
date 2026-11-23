// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Stand-ins for the handheld's Python modules, written on top of `_axiom`
 * (the worker's bridge: drawing ops, keys, sleep). Coordinates follow the
 * handheld: a 318×212 screen with (0, 0) at the top left.
 * shortcut: covers the common calls in TI's own examples; add the rest as documents need them.
 */
export const SHIMS: Record<string, string> = {
  ti_system: `
import _axiom, time as _time

def disp_clr():
    _axiom.clear_text()

def disp_at(row, text, align="left"):
    _axiom.text_at(row, str(text), align)

def disp_wait():
    while get_key() != "enter":
        _axiom.sleep(0.05)

def disp_cursor(on):
    pass

def get_key(wait=0):
    k = _axiom.get_key()
    while wait and not k:
        _axiom.sleep(0.02)
        k = _axiom.get_key()
    return k

def wait_key():
    return get_key(1)

def get_mouse():
    return (-1, -1)

def get_time_ms():
    return int(_time.time() * 1000)

def get_platform():
    return "hh"

def sleep(seconds):
    _axiom.sleep(seconds)

wait = sleep

def _unavailable(*a, **k):
    raise NotImplementedError("Sharing variables with the calculator isn't available here yet")

store_value = recall_value = store_list = recall_list = eval_function = _unavailable
`,
  ti_draw: `
import _axiom

def _rgb(r, g=None, b=None):
    if g is None:
        r, g, b = r
    return int(r), int(g), int(b)

def clear():
    _axiom.draw("clear")

def clear_rect(x, y, w, h):
    _axiom.draw("clear_rect", x, y, w, h)

def set_color(r, g=None, b=None):
    _axiom.draw("color", *_rgb(r, g, b))

def set_pen(thickness="thin", style="solid"):
    _axiom.draw("pen", str(thickness), str(style))

def draw_line(x1, y1, x2, y2):
    _axiom.draw("line", x1, y1, x2, y2)

def draw_rect(x, y, w, h):
    _axiom.draw("rect", x, y, w, h)

def fill_rect(x, y, w, h):
    _axiom.draw("fill_rect", x, y, w, h)

def draw_circle(x, y, r):
    _axiom.draw("circle", x, y, r)

def fill_circle(x, y, r):
    _axiom.draw("fill_circle", x, y, r)

def draw_arc(x, y, w, h, start, arc):
    _axiom.draw("arc", x, y, w, h, start, arc)

def fill_arc(x, y, w, h, start, arc):
    _axiom.draw("fill_arc", x, y, w, h, start, arc)

def draw_text(x, y, *text):
    _axiom.draw("text", x, y, " ".join(str(t) for t in text))

def draw_poly(xs, ys):
    _axiom.draw("poly", list(xs), list(ys))

def fill_poly(xs, ys):
    _axiom.draw("fill_poly", list(xs), list(ys))

def plot_xy(x, y, shape=1):
    _axiom.draw("point", x, y, int(shape))

def set_window(xmin, xmax, ymin, ymax):
    _axiom.draw("window", xmin, xmax, ymin, ymax)

def get_screen_dim():
    return (318, 212)

def use_buffer():
    _axiom.draw("buffer", 1)

def paint_buffer():
    _axiom.draw("paint")

def show_draw():
    _axiom.draw("paint")
`,
  ti_plotlib: `
import _axiom

_win = [-10.0, 10.0, -6.67, 6.67]

def _x(x):
    return (x - _win[0]) / (_win[1] - _win[0]) * 318

def _y(y):
    return (_win[3] - y) / (_win[3] - _win[2]) * 212

def cls():
    _axiom.draw("clear")

def window(xmin, xmax, ymin, ymax):
    _win[:] = [float(xmin), float(xmax), float(ymin), float(ymax)]

def auto_window(xs, ys):
    xs, ys = list(xs), list(ys)
    dx = (max(xs) - min(xs)) * 0.1 or 1
    dy = (max(ys) - min(ys)) * 0.1 or 1
    window(min(xs) - dx, max(xs) + dx, min(ys) - dy, max(ys) + dy)

def color(r, g=None, b=None):
    if g is None:
        r, g, b = r
    _axiom.draw("color", int(r), int(g), int(b))

def pen(size="thin", style="solid"):
    _axiom.draw("pen", str(size), str(style))

def axes(mode="on"):
    if mode == "off":
        return
    _axiom.draw("color", 0, 0, 0)
    _axiom.draw("line", 0, _y(0), 318, _y(0))
    _axiom.draw("line", _x(0), 0, _x(0), 212)

def grid(xscl=1, yscl=1, style="dot", *rest):
    _axiom.draw("color", 190, 190, 190)
    x = (_win[0] // xscl) * xscl
    while x <= _win[1]:
        _axiom.draw("line", _x(x), 0, _x(x), 212)
        x += xscl
    y = (_win[2] // yscl) * yscl
    while y <= _win[3]:
        _axiom.draw("line", 0, _y(y), 318, _y(y))
        y += yscl
    _axiom.draw("color", 0, 0, 0)

def labels(x="x", y="y", xrow=12, yrow=2):
    _axiom.text_at(xrow, str(x), "right")
    _axiom.text_at(yrow, str(y), "left")

def title(t):
    _axiom.text_at(1, str(t), "center")

def text_at(row, text, align="left", *rest):
    _axiom.text_at(row, str(text), align)

def plot(x, y=None, mark="o"):
    if isinstance(x, (list, tuple)):
        pts = list(zip(x, y))
        for (a, b), (c, d) in zip(pts, pts[1:]):
            _axiom.draw("line", _x(a), _y(b), _x(c), _y(d))
    else:
        _axiom.draw("point", _x(x), _y(y), 1)

def scatter(xs, ys, mark="o"):
    for a, b in zip(xs, ys):
        _axiom.draw("point", _x(a), _y(b), 1)

def line(x1, y1, x2, y2, mode=""):
    _axiom.draw("line", _x(x1), _y(y1), _x(x2), _y(y2))

def lin_reg(xs, ys, *rest):
    xs, ys = list(xs), list(ys)
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    m = sum((a - mx) * (b - my) for a, b in zip(xs, ys)) / sum((a - mx) ** 2 for a in xs)
    b = my - m * mx
    line(_win[0], m * _win[0] + b, _win[1], m * _win[1] + b)
    return m, b

def show_plot():
    _axiom.draw("paint")

def use_buffer():
    _axiom.draw("buffer", 1)

def paint_buffer():
    _axiom.draw("paint")
`,
  ti_hub: `raise ImportError("ti_hub needs a TI-Innovator Hub, which a browser can't reach")`,
  ti_rover: `raise ImportError("ti_rover needs a TI-Innovator Rover, which a browser can't reach")`,
  // Images as rows of (r, g, b) pixels; show_image sends the whole picture as one drawing op.
  ti_image: `
import _axiom, base64 as _b64

def _byte(v):
    return max(0, min(255, int(v)))

class _Image:
    def __init__(self, w, h, color=(255, 255, 255), name=""):
        w, h = int(w), int(h)
        if w <= 0 or h <= 0:
            raise ValueError("an image needs a width and a height of at least 1")
        self.w, self.h, self.name = w, h, name
        self._px = bytearray(bytes((_byte(color[0]), _byte(color[1]), _byte(color[2]))) * (w * h))

    def _at(self, x, y):
        x, y = int(x), int(y)
        if not (0 <= x < self.w and 0 <= y < self.h):
            raise IndexError("pixel (%d, %d) is outside the %d by %d image" % (x, y, self.w, self.h))
        return 3 * (y * self.w + x)

    def get_pixel(self, x, y):
        i = self._at(x, y)
        p = self._px
        return (p[i], p[i + 1], p[i + 2])

    def set_pixel(self, x, y, color):
        i = self._at(x, y)
        self._px[i:i + 3] = bytes((_byte(color[0]), _byte(color[1]), _byte(color[2])))

    def show_image(self, x, y):
        _axiom.draw("image", int(x), int(y), self.w, self.h, _b64.b64encode(bytes(self._px)).decode())

    def __repr__(self):
        return "<image %s %dx%d>" % (self.name or "(new)", self.w, self.h)

def new_image(width, height, color=(255, 255, 255)):
    return _Image(width, height, color)

def copy_image(image):
    im = _Image(image.w, image.h, name=image.name)
    im._px[:] = image._px
    return im

def load_image(name):
    raise OSError("load_image needs an image stored in the document, and Axiom's pages don't hold images yet: make one with new_image")
`,
};
