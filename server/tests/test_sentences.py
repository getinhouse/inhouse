from inhouse.sentences import SentenceAssembler


def feed_all(text, chunk=3):
    a = SentenceAssembler()
    out = []
    for i in range(0, len(text), chunk):
        out.extend(a.feed(text[i:i + chunk]))
    out.extend(a.flush())
    return out


def test_splits_on_sentence_boundaries():
    assert feed_all("Hello there. How are you? Fine!") == [
        "Hello there.", "How are you?", "Fine!"]


def test_flush_emits_trailing_fragment():
    assert feed_all("This never ends") == ["This never ends"]


def test_abbreviations_do_not_split():
    out = feed_all("Dr. Smith arrived. He sat down.")
    assert out == ["Dr. Smith arrived.", "He sat down."]


def test_decimals_do_not_split():
    assert feed_all("Pi is 3.14 roughly. Yes.") == ["Pi is 3.14 roughly.", "Yes."]


def test_trailing_punctuation_without_space_waits_for_flush():
    a = SentenceAssembler()
    assert a.feed("Wait...") == []
    assert a.flush() == ["Wait..."]


def test_quotes_kept_with_sentence():
    assert feed_all('She said "go." Then left.') == ['She said "go."', "Then left."]


def test_empty_stream():
    a = SentenceAssembler()
    assert a.feed("") == []
    assert a.flush() == []
