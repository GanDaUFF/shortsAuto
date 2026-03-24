"""
Transcreve áudio usando Whisper local.
Uso: python whisper_transcribe.py <caminho_do_audio> <caminho_saida_json>
"""
import sys
import json
import whisper


def format_timestamp(seconds):
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


def main():
    if len(sys.argv) < 3:
        print("Uso: python whisper_transcribe.py <audio_path> <output_json_path>")
        sys.exit(1)

    audio_path = sys.argv[1]
    output_path = sys.argv[2]

    print("[WHISPER] Carregando modelo 'base'...")
    model = whisper.load_model("base")

    print(f"[WHISPER] Transcrevendo: {audio_path}")
    result = model.transcribe(audio_path, language="pt", verbose=False)

    segments = []
    for seg in result.get("segments", []):
        segments.append({
            "start": round(seg["start"], 2),
            "end": round(seg["end"], 2),
            "startFormatted": format_timestamp(seg["start"]),
            "endFormatted": format_timestamp(seg["end"]),
            "text": seg["text"].strip(),
        })

    output = {
        "text": result.get("text", ""),
        "segments": segments,
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"[WHISPER] Transcrição salva: {output_path}")
    print(f"[WHISPER] {len(segments)} segmentos encontrados")


if __name__ == "__main__":
    main()
