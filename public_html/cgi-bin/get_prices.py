import json
import os


# Vana API ei tohi enam kõiki 96 elektrihinda tagastada.
# Mäng kasutab nüüd /api/demo/prices päringut.
def get_prices_response(_query_string):
    return 403, {
        "error": "Hinnad on mängu ajal peidetud."
    }


# Töötleb CGI-päringu ja tagastab JSON-vastuse.
def main():
    meetod = os.environ.get("REQUEST_METHOD", "GET")

    if meetod != "GET":
        status, andmed = 405, {
            "error": "Lubatud on ainult GET."
        }
    else:
        # Tagastame alati 403, sõltumata kuupäevast.
        status, andmed = get_prices_response(
            os.environ.get("QUERY_STRING", "")
        )

    # HTTP-vastuse päised.
    if status == 405:
        print("Status: 405 Method Not Allowed")
        print("Allow: GET")
    else:
        print("Status: 403 Forbidden")

    print("Content-Type: application/json; charset=utf-8")
    print("Cache-Control: no-store")
    print()

    # Tagastame veateate JSON-vormingus.
    print(json.dumps(andmed, ensure_ascii=False))


if __name__ == "__main__":
    main()
