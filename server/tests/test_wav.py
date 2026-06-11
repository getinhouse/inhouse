import struct

from inhouse.audio.wav import HEADER_SIZE, WavChunkParser, patch_wav_sizes, wav_header


def test_header_fields():
    h = wav_header(22050)
    assert h[:4] == b"RIFF" and h[8:12] == b"WAVE"
    assert struct.unpack("<I", h[24:28])[0] == 22050
    assert struct.unpack("<H", h[22:24])[0] == 1  # mono
    assert len(h) == HEADER_SIZE


def test_patch_sizes(tmp_path):
    pcm = b"\x00\x01" * 500
    path = tmp_path / "t.wav"
    path.write_bytes(wav_header(16000) + pcm)
    patch_wav_sizes(path)
    data = path.read_bytes()
    assert struct.unpack("<I", data[40:44])[0] == len(pcm)
    assert struct.unpack("<I", data[4:8])[0] == len(data) - 8


def test_parser_strips_header_single_chunk():
    pcm = b"\xaa\xbb" * 100
    p = WavChunkParser()
    out = p.feed(wav_header(24000) + pcm)
    assert out == pcm
    assert p.sample_rate == 24000
    assert p.feed(b"more") == b"more"


def test_parser_handles_split_header():
    pcm = b"\x01\x02\x03\x04"
    blob = wav_header(16000) + pcm
    p = WavChunkParser()
    out = b""
    # Feed one byte at a time across the header boundary.
    for i in range(len(blob)):
        out += p.feed(blob[i:i + 1])
    assert out == pcm
    assert p.sample_rate == 16000
