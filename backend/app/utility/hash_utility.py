import hashlib

from PIL import Image


def compute_file_hash(file_path):
    h = hashlib.sha256()
    with open(file_path, "rb") as f:
        while True:
            chunk = f.read(65536)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def compute_dhash(file_path, hash_size=8):
    img = Image.open(file_path).convert("L")
    img = img.resize((hash_size + 1, hash_size), Image.LANCZOS)
    pixels = list(img.getdata())
    w = hash_size + 1
    bits = []
    for y in range(hash_size):
        for x in range(hash_size):
            left = pixels[y * w + x]
            right = pixels[y * w + x + 1]
            bits.append("1" if left < right else "0")
    hex_str = hex(int("".join(bits), 2))[2:].zfill(hash_size * hash_size // 4)
    return hex_str


def dhash_to_bands(dhash_hex, n_bands=4):
    val = int(dhash_hex, 16)
    band_size = 64 // n_bands
    mask = (1 << band_size) - 1
    bands = []
    for i in range(n_bands):
        bands.append((val >> (i * band_size)) & mask)
    return bands


def hamming_distance(h1, h2):
    v1 = int(h1, 16)
    v2 = int(h2, 16)
    return bin(v1 ^ v2).count("1")
