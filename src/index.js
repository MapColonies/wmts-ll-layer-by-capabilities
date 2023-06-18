import { KVPTileUrl } from './tileUrlManager/KVPTileUrl';
import { RestfulTileUrl } from './tileUrlManager/RestfulTileUrl';
export function getLayerByCapabilities(capabilities, identifier, queryParams) {
  const token = queryParams.token;
  const allLayers = capabilities.Contents.Layer;
  const chosenLayer = Array.from(allLayers).find((layer) => layer.Identifier.textContent === identifier);

  if (chosenLayer) {
    const { tileMatrixSet, title, style, format } = extractLayerProperties(chosenLayer);

    //kvp or rest
    let tileUrlTemplate;
    if (capabilities.OperationsMetadata) {
      tileUrlTemplate = new KVPTileUrl(capabilities);
    } else {
      tileUrlTemplate = new RestfulTileUrl(capabilities);
    }

    tileUrlTemplate.insertQueryParams({
      layer: title,
      style: style,
      tileMatrixSet: tileMatrixSet,
      format: format,
    });

    const validUrl = replaceTileUrlPlaceholders(tileUrlTemplate, tileMatrixSet);

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
  const title = selectedLayer.Title.textContent;
  const format = selectedLayer.Format.textContent;
  const tileMatrixSet = selectedLayer.TileMatrixSetLink.TileMatrixSet.textContent;
  const style = selectedLayer.Style.Identifier.textContent;
  return { tileMatrixSet, title, style, format };
}

function replaceTileUrlPlaceholders(url, tileMatrixSet) {
  return url.replace('{TileMatrixSet}', tileMatrixSet).replace('{TileMatrix}', '{z}').replace('{TileCol}', '{x}').replace('{TileRow}', '{y}');
}

function getCapabilitiesUrl(url, queryParams) {
  if (url.includes('WMTSCapabilities.xml') || url.includes('REQUEST=GetCapabilities')) {
    return concatParamsToUrl(url, queryParams);
  } else {
    //by defalt, KVP capabilities url.
    const reqUrl = url + `/service?Request=GetCapabilities&SERVICE=WMTS`;
    return concatParamsToUrl(reqUrl, queryParams);
  }
}

function concatParamsToUrl(url, queryParams) {
  let paramSign = url.includes('?') ? '&' : '?';
  let fixedUrl = url;
  for (const [key, value] of Object.entries(queryParams)) {
    fixedUrl += `${paramSign}${key}=${value}`;
    paramSign = '&';
  }
  return fixedUrl;
}

function domToJson(dom) {
  if (dom.nodeType === Node.TEXT_NODE) {
    return dom.nodeValue;
  }
  if (dom.nodeType === Node.ELEMENT_NODE) {
    const obj = {};

    if (dom.attributes.length > 0) {
      obj.attributes = {};

      for (let i = 0, len = dom.attributes.length; i < len; ++i) {
        const attr = dom.attributes[i];
        const attrValue = attr.value.trim();
        if (attrValue !== '') {
          //remove preName of tag (':' can't be read as a propery)
          const attributeName = attr.name.includes(':') ? attr.name.substring(attr.name.indexOf(':') + 1) : attr.name;
          obj.attributes[attributeName] = attrValue;
        }
      }

      if (Object.keys(obj.attributes).length === 0) {
        obj.attributes = null;
      }
    }

    let childCount = 0;
    for (let child = dom.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        //remove preName of tag (':' can't be read as a propery)
        const childTag = child.tagName.includes(':') ? child.tagName.substring(child.tagName.indexOf(':') + 1) : child.tagName;
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
          const parentChildCount = dom.childElementCount || 0;
          if (parentChildCount === 1) {
            obj[dom.tagName] = textContent;
          } else {
            obj[`textContent`] = textContent;
          }
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
      return domToJson(parsedXml.documentElement);
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
