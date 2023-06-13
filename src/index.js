export function getLayerByCapabilities(capabilities, identifier, queryParams) {
  const token = queryParams.token;
  const content = capabilities.children.find((x) => x.tagName == 'Contents').children;
  console.log(capabilities);
  const allIdentifiers = capabilities.querySelectorAll('Identifier');
  const selectedIdentifier = Array.from(allIdentifiers).find((currentIdentifier) => currentIdentifier.textContent === identifier);

  if (selectedIdentifier) {
    const fittingLayer = selectedIdentifier.parentNode;
    const { tileUrlTemplate, tileMatrixSet, title, style, format } = extractLayerProperties(fittingLayer);

    const validUrl = replaceTileUrlPlaceholders(tileUrlTemplate, tileMatrixSet, token);

    const wmtsLayer = L.tileLayer(validUrl, {
      layers: title,
      style: style,
      format: format,
      tilematrixset: tileMatrixSet,
    });

    return wmtsLayer;
  } else {
    throw new Error('Failed to find Layer with given identifier');
  }
}

function extractLayerProperties(selectedLayer) {
  const title = selectedLayer.querySelector('Title').textContent;
  let tileUrlTemplate = selectedLayer.querySelector('ResourceURL');
  if (tileUrlTemplate) {
    tileUrlTemplate = tileUrlTemplate.attributes.template.textContent;
  } else {
    //create kvp url template
    tileUrlTemplate =
      'https://mapproxy-raster-dev-route-raster-dev.apps.j1lk3njp.eastus.aroapp.io/api/raster/v1/service?token=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJNYXBDb2xvbmllc0RldiIsImlhdCI6MTUxNjIzOTAyMiwiZCI6WyJyYXN0ZXIiLCJyYXN0ZXJXbXMiLCJyYXN0ZXJFeHBvcnQiLCJkZW0iLCJ2ZWN0b3IiLCIzZCJdfQ.GvTQ_yLjnioxxFrNgGQiuarhJxLpe8AhTTtrWE3LHoUED48CFKBEOfKqOyEWSDVZjx1jHkDvZAL1iyEvi5FHNys7UBRXCiJvVlG-muJZ6ycS9PGKauzL-eggXqTqGsXh4FBkqvHUEElXEnu7ARsMCm5eIC66U2i_eHFU3PLcOc67qJvS1IQjAI2oj9Pd5mGaI_HlDaf3B4PFOb0AHdY-r_MDGwck3asm1G_InVzsvCXt36vImyn1Z4HYaN4YiDfaMLBF0-GGrlLE84PObzGGtt66EIuQ4OneEZSzoQNusBt5-SFs0EQXsfsDc_RMRTz3DZseqkNIKiXEsEBBPjMr7w&LAYER=bluemarble-Orthophoto&FORMAT=image/png&CRS=EPSG:4326&TRANSPARENT=TRUEC&SERVICE=WMTS&VERSION=1.1.1&REQUEST=GetTile&STYLE&tilematrixset=newGrids&tilerow=3&tilecol=4&tilematrix=3';
  }
  const style = selectedLayer.querySelector('Format').textContent;
  const tileMatrixSet = selectedLayer.querySelector('TileMatrixSet').textContent;
  const format = selectedLayer.querySelector('Style').children[0].textContent;
  return { tileUrlTemplate, tileMatrixSet, title, style, format };
}

function replaceTileUrlPlaceholders(url, tileMatrixSet, token) {
  const replacedUrl = url
    .replace('{TileMatrixSet}', tileMatrixSet)
    .replace('{TileMatrix}', '{z}')
    .replace('{TileCol}', '{x}')
    .replace('{TileRow}', '{y}');

  return token ? addToken(replacedUrl, token) : replacedUrl;
}

function getCapabilitiesUrl(url, queryParams) {
  const token = queryParams.token;
  let reqUrl;

  if (String(url).includes('WMTSCapabilities.xml') || String(url).includes('REQUEST=GetCapabilities')) {
    reqUrl = token ? addToken(url, token) : url;
  } else {
    const version = '1.0.0';
    reqUrl = token ? addToken(`${url}/wmts/${version}/WMTSCapabilities.xml`, token) : `${url}/wmts/${version}/WMTSCapabilities.xml`;
  }
  return reqUrl;
}

function addToken(url, token) {
  return String(url).includes('?') ? url + `&token=${token}` : url + `?token=${token}`;
}

function domToJson(dom) {
  if (dom.nodeType === Node.ELEMENT_NODE) {
    const obj = {};

    if (dom.attributes.length > 0) {
      obj.attributes = {};

      for (let i = 0, len = dom.attributes.length; i < len; ++i) {
        const attr = dom.attributes[i];
        const attrValue = attr.value.trim();
        if (attrValue !== '') {
          obj.attributes[attr.name] = attrValue;
        }
      }

      if (Object.keys(obj.attributes).length === 0) {
        obj.attributes = null;
      }
    }

    let childCount = 0;
    for (let child = dom.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const childTag = child.tagName;
        if (!obj[childTag]) {
          obj[childTag] = null;
        }
        const childObj = domToJson(child);
        if (obj[childTag] === null) {
          obj[childTag] = childObj;
        } else {
          if (!Array.isArray(obj[childTag])) {
            obj[childTag] = [obj[childTag]];
          }
          obj[childTag].push(childObj);
        }
        childCount++;
      } else if (child.nodeType === Node.TEXT_NODE) {
        const textContent = child.nodeValue.trim();
        if (textContent !== '') {
          obj[dom.tagName] = textContent;
        }
      }
    }

    // If the root element has only one child element, unwrap it
    const childTags = Object.keys(obj);
    if (childTags.length === 1) {
      const singleChildTag = childTags[0];
      if (Array.isArray(obj[singleChildTag])) {
        obj[singleChildTag] = obj[singleChildTag][0];
      }
    }

    // Return the resulting object
    return obj;
  }

  // If the current node is not an element node, return null
  return null;
}

export async function getWMTSCapabilities(url, queryParams, headerParams) {
  const SUCCESS_STATUS_CODE = 200;

  try {
    const reqXmlUrl = getCapabilitiesUrl(url, queryParams);
    const response = await fetch(reqXmlUrl, { headers: headerParams });

    if (response.status === SUCCESS_STATUS_CODE) {
      const capabilitiesXml = await response.text();
      const parser = new DOMParser();
      const parsedXml = parser.parseFromString(capabilitiesXml, 'text/xml');
      console.log(domToJson(parsedXml.documentElement));
      return domToJson(parsedXml);
    } else {
      throw new Error('Failed to retrieve WMTS capabilities');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : JSON.stringify(error);
    throw new Error(`Error retrieving WMTS capabilities: ${message}`);
  }
}

export async function getLayer(url, identifier, queryParams, headersParams) {
  return getLayerByCapabilities(await getWMTSCapabilities(url, queryParams, headersParams), identifier, queryParams);
}
