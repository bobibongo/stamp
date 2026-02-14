import { NextResponse } from 'next/server';
import { XMLParser } from 'fast-xml-parser';

// Konfiguracja BIR1 Test
const GUS_API_URL = 'https://wyszukiwarkaregontest.stat.gov.pl/wsBIR/UslugaBIRzewnPubl.svc';
const GUS_API_KEY = 'abcde12345abcde12345';

// Pomocnicza funkcja do wysyłania żądań SOAP
async function soapRequest(action: string, body: string, sid: string | null = null) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/soap+xml; charset=utf-8',
    // Action musi być zgodny z definicją w WSDL
    'Action': action
  };

  if (sid) {
    headers['sid'] = sid;
  }

  const envelope = `
    <soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:ns="http://CIS/BIR/PUBL/2014/07" xmlns:dat="http://CIS/BIR/PUBL/2014/07/DataContract">
      <soap:Header xmlns:wsa="http://www.w3.org/2005/08/addressing">
        <wsa:To>${GUS_API_URL}</wsa:To>
        <wsa:Action>${action}</wsa:Action>
      </soap:Header>
      <soap:Body>
        ${body}
      </soap:Body>
    </soap:Envelope>
  `;

  const response = await fetch(GUS_API_URL, {
    method: 'POST',
    headers: headers,
    body: envelope.trim()
  });

  const text = await response.text();
  return text;
}

export async function POST(request: Request) {
  try {
    const { type, value } = await request.json();

    if (!value) {
      return NextResponse.json({ error: 'Brak wartości do wyszukania' }, { status: 400 });
    }

    // Helper to extract XML from Multipart/XOP response
    const extractXml = (response: string) => {
      const match = response.match(/<s:Envelope[\s\S]*?<\/s:Envelope>/);
      return match ? match[0] : response;
    };

    // 1. Logowanie (Pobranie sesji)
    const loginBody = `
      <ns:Zaloguj>
        <ns:pKluczUzytkownika>${GUS_API_KEY}</ns:pKluczUzytkownika>
      </ns:Zaloguj>
    `;

    const loginResponse = await soapRequest('http://CIS/BIR/PUBL/2014/07/IUslugaBIRzewnPubl/Zaloguj', loginBody);

    // Proste wyciągnięcie SID regexem (szybsze i odporne na multipart)
    const sidMatch = loginResponse.match(/<ZalogujResult>(.*?)<\/ZalogujResult>/);
    const sid = sidMatch ? sidMatch[1] : null;

    if (!sid) {
      console.error('GUS Login Error:', loginResponse);
      return NextResponse.json({ error: 'Nie udało się zalogować do GUS' }, { status: 500 });
    }

    // 2. Wyszukiwanie podmiotu
    // Parametry wyszukiwania - UWAGA: Używamy namespace 'dat' (DataContract) dla parametrów
    let pParametryWyszukiwania = '';
    if (type === 'NIP') {
      pParametryWyszukiwania = `<dat:Nip>${value}</dat:Nip>`;
    } else if (type === 'REGON') {
      pParametryWyszukiwania = `<dat:Regon>${value}</dat:Regon>`;
    } else if (type === 'KRS') {
      pParametryWyszukiwania = `<dat:Krs>${value}</dat:Krs>`;
    } else {
      pParametryWyszukiwania = `<dat:Nip>${value}</dat:Nip>`;
    }

    const searchBody = `
      <ns:DaneSzukajPodmioty>
        <ns:pParametryWyszukiwania>
          ${pParametryWyszukiwania}
        </ns:pParametryWyszukiwania>
      </ns:DaneSzukajPodmioty>
    `;

    const searchResponse = await soapRequest('http://CIS/BIR/PUBL/2014/07/IUslugaBIRzewnPubl/DaneSzukajPodmioty', searchBody, sid);

    // Parsowanie odpowiedzi wyszukiwania
    // Wyciągnij XML z multipart
    const cleanXml = extractXml(searchResponse);

    const parser = new XMLParser();
    const searchDataRaw = parser.parse(cleanXml);

    // Ścieżka do wyniku może się różnić w zależności od parsera i namespace'ów
    // Najbezpieczniej poszukać DaneSzukajPodmiotyResult
    const innerXml = searchDataRaw?.['s:Envelope']?.['s:Body']?.['DaneSzukajPodmiotyResponse']?.['DaneSzukajPodmiotyResult'];

    if (!innerXml) {
      return NextResponse.json({ error: 'Brak danych w odpowiedzi GUS' }, { status: 404 });
    }

    // Wewnętrzny XML też trzeba sparsować
    const searchData = parser.parse(innerXml);

    // Sprawdzenie czy znaleziono podmiot (root -> dane)
    const dane = searchData?.root?.dane;

    if (!dane) {
      // Czasami GUS zwraca błąd w ten sposób lub pusty wynik
      // Sprawdźmy czy nie ma komunikatu o błędzie
      const errorCode = searchData?.root?.dane?.ErrorCode;
      if (errorCode) {
        return NextResponse.json({ error: `Błąd GUS: ${searchData?.root?.dane?.ErrorMessagePl || errorCode}` }, { status: 404 });
      }
      return NextResponse.json({ error: 'Nie znaleziono podmiotu' }, { status: 404 });
    }

    // Wyciągamy interesujące nas pola
    // GUS zwraca tablicę jeśli jest więcej wyników, ale przy NIP/REGON/KRS powinien być jeden (chyba że jednostki lokalne)
    // Bierzemy pierwszy wynik jeśli to tablica
    const result = Array.isArray(dane) ? dane[0] : dane;

    const firma = {
      nazwa: result.Nazwa,
      ulica: result.Ulica,
      nrNieruchomosci: result.NrNieruchomosci,
      nrLokalu: result.NrLokalu,
      miejscowosc: result.Miejscowosc,
      kodPocztowy: result.KodPocztowy,
      poczta: result.Poczta, // Czasem przydatne
      nip: result.Nip,
      regon: result.Regon,
      krs: result.Krs,
      wojewodztwo: result.Wojewodztwo,
      powiat: result.Powiat,
      gmina: result.Gmina
    };

    // 3. Wylogowanie (Opcjonalne, ale dobre dla higieny, choć sesja i tak wygaśnie)
    // Nie blokujemy odpowiedzi czekaniem na wylogowanie
    const logoutBody = `<ns:Wyloguj><ns:pIdentyfikatorSesji>${sid}</ns:pIdentyfikatorSesji></ns:Wyloguj>`;
    soapRequest('http://CIS/BIR/PUBL/2014/07/IUslugaBIRzewnPubl/Wyloguj', logoutBody, sid).catch(console.error);

    return NextResponse.json(firma);

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Wystąpił błąd serwera podczas łączenia z GUS' }, { status: 500 });
  }
}
