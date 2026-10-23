"""QR codes of the addresses, so that the phone opens them by pointing its camera at the screen.

Drawn in the black window of start-phone.bat and start-anywhere.bat, and on the page
that start-phone.bat opens on the computer. The small package that draws them is
installed the first time it is needed, for a computer set up before it was added.
"""

import io
import re
import subprocess
import sys


def _library():
    try:
        import qrcode
    except ImportError:
        print("Installing the small package that draws QR codes (once)...")
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", "qrcode==8.2"], check=False)
        try:
            import qrcode
        except ImportError:
            return None
    return qrcode


def _code(url):
    qrcode = _library()
    if not qrcode:
        return None
    code = qrcode.QRCode(border=2, error_correction=qrcode.constants.ERROR_CORRECT_M)
    code.add_data(url)
    code.make(fit=True)
    return code


def print_code(url):
    """Draw the QR code of `url` in the window, light on dark so that a phone reads it."""
    code = _code(url)
    if not code:
        print("  (The QR code could not be drawn: type the address instead.)")
        return
    out = io.StringIO()
    code.print_ascii(out=out, invert=True)
    try:
        sys.stdout.write(out.getvalue())
    except UnicodeEncodeError:   # a window that cannot show the blocks
        print("  (This window cannot draw the QR code: type the address instead.)")
    sys.stdout.flush()


def svg(url):
    """The QR code of `url` as an SVG image, for a web page; empty when it cannot be drawn."""
    code = _code(url)
    if not code:
        return ""
    import qrcode.image.svg

    out = io.BytesIO()
    code.make_image(image_factory=qrcode.image.svg.SvgPathImage).save(out)
    # Inside a page, the image needs no "<?xml ...?>" line of its own.
    return re.sub(r"^<\?xml[^>]*>\s*", "", out.getvalue().decode("utf-8"))
