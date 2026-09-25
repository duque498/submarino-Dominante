# vendor/

## supabase.js

O UMD do `@supabase/supabase-js` **2.117.2**, byte a byte como o npm o
publica — o arquivo não é tocado, pra qualquer um poder conferir:

```
sha256: 59d39487c3589843b410322d8a3d562ce022aba1e5ccb16898ef3fb2a0da2ecd
origem: https://registry.npmjs.org/@supabase/supabase-js/-/supabase-js-2.117.2.tgz
        (dentro do tarball: package/dist/umd/supabase.js)
```

Fica commitado porque o app roda por `file://` num Chromebook e a rede da
escola não é confiável: com a biblioteca aqui do lado, carregar o controle
remoto custa **zero rede**. A jsDelivr continua existindo só como segundo
candidato, se este arquivo não estiver junto (alguém copiou o `index.html`
sozinho, por exemplo).

## Pra atualizar a versão

1. Baixe o tarball da versão nova no endereço acima (troque o número).
2. Extraia `package/dist/umd/supabase.js` pra cá.
3. Atualize o número em **quatro** lugares: este README (com o sha256 novo,
   `sha256sum supabase.js`), `src/remoto/config.ts` (`VERSAO_SUPABASE`),
   `index.html` e `public/controle.html` (a URL da jsDelivr de reserva).
4. Leia o porquê da última troca no comentário do `config.ts` antes —
   a 2.45.4 → 2.117.2 não foi higiene, foi a chave `sb_publishable_`
   indo parar no `access_token` do join.
