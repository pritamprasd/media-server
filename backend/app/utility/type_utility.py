def safe_int(val):
    try:
        return int(val)
    except (ValueError, TypeError):
        return None
