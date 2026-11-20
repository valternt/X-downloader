import os
import zlib
import struct
import math

def make_png(width, height, rgba_data):
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    
    raw = bytearray()
    for y in range(height):
        raw.append(0)  # filter type 0 (None)
        raw.extend(rgba_data[y * width * 4 : (y + 1) * width * 4])
        
    return (
        b'\x89PNG\r\n\x1a\n' +
        chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)) +
        chunk(b'IDAT', zlib.compress(bytes(raw), 9)) +
        chunk(b'IEND', b'')
    )

def generate_icon(size):
    # Create an RGBA buffer
    pixels = bytearray(size * size * 4)
    center = size / 2.0
    radius = size * 0.46
    
    # Background: Twitter / X themed sleek dark rounded square or circle with blue accent
    # Colors: Dark Slate background (#0f1419) with X Blue (#1d9bf0) and white icon
    bg_r, bg_g, bg_b = 29, 155, 240   # Twitter Blue
    fg_r, fg_g, fg_b = 255, 255, 255 # White
    
    corner_radius = size * 0.22
    
    def in_rounded_rect(x, y):
        # Margin
        m = size * 0.05
        w = size - 2 * m
        h = size - 2 * m
        rx = x - m
        ry = y - m
        if rx < 0 or rx > w or ry < 0 or ry > h:
            return 0.0
        
        # Check corners
        dx = 0
        dy = 0
        if rx < corner_radius:
            dx = corner_radius - rx
        elif rx > w - corner_radius:
            dx = rx - (w - corner_radius)
        if ry < corner_radius:
            dy = corner_radius - ry
        elif ry > h - corner_radius:
            dy = ry - (h - corner_radius)
            
        dist = math.sqrt(dx * dx + dy * dy)
        if dist <= corner_radius - 0.5:
            return 1.0
        elif dist >= corner_radius + 0.5:
            return 0.0
        else:
            return (corner_radius + 0.5 - dist)

    for y in range(size):
        for x in range(size):
            idx = (y * size + x) * 4
            cov = in_rounded_rect(x + 0.5, y + 0.5)
            if cov <= 0:
                pixels[idx:idx+4] = [0, 0, 0, 0]
                continue
            
            # Icon geometry: Down arrow + tray
            # Normalized coordinates [-1, 1] inside icon area
            nx = (x + 0.5 - center) / (size * 0.38)
            ny = (y + 0.5 - center) / (size * 0.38)
            
            is_fg = False
            
            # Tray: horizontal line at bottom ny in [0.45, 0.65], nx in [-0.7, 0.7]
            # with vertical edges nx in [-0.7, -0.5] and [0.5, 0.7], ny in [0.15, 0.65]
            if 0.42 <= ny <= 0.68 and -0.72 <= nx <= 0.72:
                is_fg = True
            elif 0.15 <= ny <= 0.68 and (abs(nx) >= 0.52 and abs(nx) <= 0.72):
                is_fg = True
                
            # Arrow stem: vertical bar nx in [-0.18, 0.18], ny in [-0.65, 0.05]
            if -0.16 <= nx <= 0.16 and -0.65 <= ny <= 0.12:
                is_fg = True
                
            # Arrow head: triangle pointing down
            # apex at ny = 0.28, nx = 0; base at ny = -0.05, nx width = 0.55
            if -0.05 <= ny <= 0.28:
                max_w = 0.55 * (1.0 - (ny - (-0.05)) / 0.33)
                if abs(nx) <= max_w:
                    is_fg = True
            
            if is_fg:
                pixels[idx] = fg_r
                pixels[idx+1] = fg_g
                pixels[idx+2] = fg_b
                pixels[idx+3] = int(255 * cov)
            else:
                pixels[idx] = bg_r
                pixels[idx+1] = bg_g
                pixels[idx+2] = bg_b
                pixels[idx+3] = int(255 * cov)
                
    return make_png(size, size, pixels)

os.makedirs('icons', exist_ok=True)
for s in [16, 48, 128]:
    data = generate_icon(s)
    path = f'icons/icon-{s}.png'
    with open(path, 'wb') as f:
        f.write(data)
    print(f'Generated {path} ({s}x{s}, {len(data)} bytes)')
