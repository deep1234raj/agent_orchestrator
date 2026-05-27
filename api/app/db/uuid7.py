"""UUID v7 generator.

UUID v7 embeds a millisecond Unix timestamp in the high bits, which makes
generated IDs naturally time-ordered. This is friendlier to B-tree indexes
than UUID v4 and gives us free chronological sortability without an extra
column.

Reference: RFC 9562.
"""

from __future__ import annotations

import os
import time
import uuid


def uuid7() -> uuid.UUID:
    """Generate a UUID v7."""
    # 48-bit Unix timestamp in milliseconds
    ms = int(time.time() * 1000)
    ts_bytes = ms.to_bytes(6, "big")

    # 10 random bytes for the rest (74 random bits + version/variant)
    rand = os.urandom(10)

    # Assemble: 6 ts bytes + 10 random bytes = 16 bytes total
    b = bytearray(ts_bytes + rand)

    # Set version to 7 (top 4 bits of byte 6)
    b[6] = (b[6] & 0x0F) | 0x70
    # Set variant to RFC 4122 (top 2 bits of byte 8)
    b[8] = (b[8] & 0x3F) | 0x80

    return uuid.UUID(bytes=bytes(b))
