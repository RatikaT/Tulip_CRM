"""
Shared Excel export conventions (openpyxl): bold+frozen header, autofilter,
real datetime cells, sensible column widths, and a Summary cover sheet.
"""
from datetime import datetime, date
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

HEADER_FONT = Font(bold=True, color="FFFFFF")
HEADER_FILL = PatternFill(start_color="1F4E79", end_color="1F4E79", fill_type="solid")
HEADER_ALIGN = Alignment(horizontal="center", vertical="center", wrap_text=True)
TITLE_FONT = Font(bold=True, size=14, color="1F4E79")
LABEL_FONT = Font(bold=True)
_side = Side(style="thin")
THIN = Border(left=_side, right=_side, top=_side, bottom=_side)
CELL_ALIGN = Alignment(vertical="center")

DT_FMT = "dd mmm yyyy hh:mm"
DATE_FMT = "dd mmm yyyy"


def _as_dt(v):
    """Coerce a date to datetime so openpyxl formats it as a real date/time."""
    if isinstance(v, datetime):
        return v
    if isinstance(v, date):
        return datetime(v.year, v.month, v.day)
    return None


def write_headers(ws, headers):
    """Write a bold header row, freeze it (A2)."""
    for col, h in enumerate(headers, 1):
        c = ws.cell(row=1, column=col, value=h)
        c.font = HEADER_FONT
        c.fill = HEADER_FILL
        c.alignment = HEADER_ALIGN
        c.border = THIN
    ws.freeze_panes = "A2"


def write_row(ws, row_idx, values, dt_cols=(), date_cols=()):
    """
    Write one data row. Column indices in dt_cols get "dd mmm yyyy hh:mm";
    date_cols get "dd mmm yyyy". Both accept datetime/date; others written as-is.
    """
    dt_cols = set(dt_cols)
    date_cols = set(date_cols)
    for i, v in enumerate(values, 1):
        c = ws.cell(row=row_idx, column=i)
        c.border = THIN
        c.alignment = CELL_ALIGN
        if v is None or v == "":
            continue
        if i in dt_cols:
            dt = _as_dt(v)
            if dt is not None:
                c.value = dt
                c.number_format = DT_FMT
                continue
        if i in date_cols:
            dt = _as_dt(v)
            if dt is not None:
                c.value = dt
                c.number_format = DATE_FMT
                continue
        c.value = v


def finalize(ws, cap=40):
    """Enable autofilter and set column widths (capped)."""
    if ws.max_row >= 1 and ws.max_column >= 1:
        ws.auto_filter.ref = ws.dimensions
    for col in ws.columns:
        letter = col[0].column_letter
        maxlen = 0
        for cell in col:
            if cell.value is not None:
                # measure the display value length (dates render ~11-16 chars)
                sval = cell.value.strftime("%d %b %Y %H:%M") if isinstance(cell.value, (datetime, date)) else str(cell.value)
                maxlen = max(maxlen, len(sval))
        ws.column_dimensions[letter].width = min(max(maxlen + 2, 10), cap)


def summary_sheet(wb, title):
    """Create the Summary cover sheet FIRST (position 0) and return it."""
    ws = wb.create_sheet(title="Summary", index=0)
    ws.column_dimensions["A"].width = 34
    ws.column_dimensions["B"].width = 44
    ws.column_dimensions["C"].width = 16
    t = ws.cell(row=1, column=1, value=title)
    t.font = TITLE_FONT
    ws._next = 3  # cursor for helpers below
    return ws


def summary_kv(ws, label, value, dt=False, date_only=False):
    """Write a 'Label: value' line on the summary sheet."""
    r = getattr(ws, "_next", 3)
    lc = ws.cell(row=r, column=1, value=label)
    lc.font = LABEL_FONT
    vc = ws.cell(row=r, column=2)
    dtv = _as_dt(value) if (dt or date_only) else None
    if dtv is not None:
        vc.value = dtv
        vc.number_format = DATE_FMT if date_only else DT_FMT
    else:
        vc.value = value
    ws._next = r + 1
    return r


def summary_section(ws, title, pairs):
    """A titled breakdown block: title row, then (name, count) rows."""
    r = getattr(ws, "_next", 3) + 1
    hc = ws.cell(row=r, column=1, value=title)
    hc.font = LABEL_FONT
    hc.fill = HEADER_FILL
    hc.font = HEADER_FONT
    r += 1
    for name, count in pairs:
        ws.cell(row=r, column=1, value=str(name) if name is not None else "—")
        ws.cell(row=r, column=2, value=count)
        r += 1
    ws._next = r + 1
