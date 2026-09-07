/**
 * Service for Dominican Republic RNC and Cédula DGII Consultation
 * Powered by Megaplus API (https://rnc.megaplus.com.do/apidocs/)
 */

async function queryRncApi(rawRnc) {
  if (!rawRnc) {
    throw new Error('Debe proporcionar un número de RNC o Cédula.');
  }

  // Remove all non-digits
  const cleanRnc = String(rawRnc).replace(/[^0-9]/g, '').trim();

  if (cleanRnc.length !== 9 && cleanRnc.length !== 11) {
    throw new Error(`Longitud inválida (${cleanRnc.length} dígitos). El RNC debe tener 9 dígitos y la Cédula 11 dígitos.`);
  }

  const url = `https://rnc.megaplus.com.do/api/consulta?rnc=${cleanRnc}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'SGC-ERP/1.0 (Comercial Cambri)'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok && response.status !== 404 && response.status !== 400) {
      throw new Error(`Error en el servidor de consulta DGII (HTTP ${response.status})`);
    }

    const data = await response.json();

    if (data.error || data.codigo_http === 404) {
      return {
        found: false,
        rnc: cleanRnc,
        formatted_rnc: formatRnc(cleanRnc),
        message: data.mensaje || 'El RNC/Cédula no se encuentra inscrito como contribuyente en la DGII.'
      };
    }

    return {
      found: true,
      rnc: data.rnc_consultado || cleanRnc,
      formatted_rnc: data.cedula_rnc || formatRnc(cleanRnc),
      legal_name: data.nombre_razon_social || '',
      commercial_name: data.nombre_comercial || data.nombre_razon_social || '',
      category: data.categoria || '',
      payment_regime: data.regimen_de_pagos || 'NORMAL',
      status: (data.estado || 'ACTIVO').toUpperCase(),
      economic_activity: data.actividad_economica || '',
      local_administration: data.administracion_local || '',
      electronic_billing: (data.facturador_electronico || 'NO').toUpperCase(),
      person_type: cleanRnc.length === 9 ? 'juridica' : 'natural'
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('El servicio de consulta DGII tardó demasiado en responder (Timeout).');
    }
    throw err;
  }
}

async function searchRncByName(term, page = 1) {
  if (!term || term.trim().length < 3) {
    throw new Error('Debe ingresar al menos 3 caracteres para buscar por razón social.');
  }

  const cleanTerm = term.trim();
  const url = `https://rnc.megaplus.com.do/api/consulta/nombres?buscar=${encodeURIComponent(cleanTerm)}&pagina=${page}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'SGC-ERP/1.0 (Comercial Cambri)'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const data = await response.json();
    return {
      success: !data.error,
      results: data.resultados || [],
      page: Number(page),
      total: data.resultados?.length || 0
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Tiempo de espera agotado buscando por nombre en DGII.');
    }
    throw err;
  }
}

function formatRnc(digits) {
  if (digits.length === 9) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 8)}-${digits.slice(8)}`;
  } else if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 10)}-${digits.slice(10)}`;
  }
  return digits;
}

module.exports = {
  queryRncApi,
  searchRncByName,
  formatRnc
};
