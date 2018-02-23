$(document).ready(function () {
    $("#btnUpload").click(function () {
        $("#inputSourceFile").click();
    });

    $("#btnDownload").click(function () {
        var link = $("#btnDownload").get(0);
        link.href = $("#export-container canvas").get(0).toDataURL();
        link.download = "soy_agacim.png";
    });

    $("#inputSourceFile").change(function (e) {
        $("#preloader").show();
        var file = e.target.files[0];
        var fileReader = new FileReader();

        fileReader.onload = function () {
            var typedarray = new Uint8Array(this.result);
            PDFJS.getDocument(typedarray).then(function (pdf) {
                var pdfDocument = pdf;
                var pagesPromises = [];

                for (var i = 0; i < pdf.pdfInfo.numPages; i++) {
                    (function (pageNumber) {
                        pagesPromises.push(getPageText(pageNumber, pdfDocument));
                    })(i + 1);
                }

                Promise.all(pagesPromises).then(function (pageItems) {
                    try {
                        processPdfAndDraw(pageItems);
                        $("#preloader").hide();
                    }
                    catch (err) {
                        $("#preloader").hide();
                        alert("Üzgünüz, dosyanız okunamadı");
                    }
                });

            }, function (reason) {
                $("#preloader").hide();
                console.error(reason);
            });
        };

        try{
            fileReader.readAsArrayBuffer(file);
        }
        catch(err){
            console.error(err);
            $("#preloader").hide();
            alert("Üzgünüz, dosyanız okunamadı");
        }
    });

    function processPdfAndDraw(pageItems) {
        var people = [];
        var textItems = [];
        for (var i = 0; i < pageItems.length; i++) {
            textItems = textItems.concat(pageItems[i]);
        }

        textItems = textItems.filter(function (value) {
            return value.str != " ";
        });

        for (var i = 0; i < textItems.length; i++) {
            // satır başlangıcını tespit et
            if (isNewRow(i, textItems)) {
                // satır sonunu bulana kadar devam et
                var cells = [];
                cells.push(textItems[i].str);
                var j = 1;
                while (!isEndOfRow(i + j, textItems) && i + j < textItems.length) {
                    if (textItems[i + j].str != "KÖYÜ" && textItems[i + j].str != "MAHALLESİ") {
                        cells.push(textItems[i + j].str);
                    }
                    j++;
                }

                if(textItems.length > i + j){
                    cells.push(textItems[i + j].str);
                }
                i = i + j;

                var person = {
                    id: cells[0],
                    sira: cells[0],
                    cinsiyet: cells[1],
                    olumTarihi: cells[cells.length - 1],
                    durumu: cells[cells.length - 2],
                    medeniHali: cells[cells.length - 3],
                    ciltHaneBireySiraNo: cells[cells.length - 4],
                    mahalleKoy: cells[cells.length - 5],
                    ilce: cells[cells.length - 6],
                    il: cells[cells.length - 7],
                    dogumTarihi: cells[cells.length - 8],
                    dogumYeri: cells[cells.length - 9],
                    anaAdi: cells[cells.length - 10],
                    babaAdi: cells[cells.length - 11],
                    soyadi: cells[cells.length - 12],
                    adi: cells[cells.length - 13],
                    yakinlik: "",
                    level: 0
                }

                var mismatchedCells = 0;
                for (var k = 0; k < cells.length - 15; k++) {
                    if(isRelationType(cells[2+k])){
                        person.yakinlik += " " + cells[2 + k];
                    }
                    else{
                        mismatchedCells++;
                    }
                }

                if(mismatchedCells > 0){
                    person.adi = cells[cells.length - 13 - mismatchedCells];
                }

                person.yakinlik = person.yakinlik.trim();


                people.push(person);
            }
        }

        if(people.length == 0){
            alert("Üzgünüz, dosyanız okunamadı.\r\nYüklemiş olduğunuz dosya metin bazlı değil.");
            return;
        }

        var nodes = [];
        var edges = [];
        for (var i = 0; i < people.length; i++) {
            createNodesAndEdges(people[i], people, nodes, edges)
        }

        // adjust level
        var maxLevel = 0;
        var minLevel = 0;
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].level > maxLevel) {
                maxLevel = nodes[i].level;
            }
            if (nodes[i].level < minLevel) {
                minLevel = nodes[i].level;
            }
        }

        nodes.forEach(function (node) {
            node.level = maxLevel - node.level;
            if (node.yakinlik.startsWith("Babası")) {
                node.group = "baba";
            }
            else if (node.yakinlik.startsWith("Annesi")) {
                node.group = "anne";
            }
            else {
                node.group = "baba";
            }
        });

        edges.forEach(function (edge) {
            if (edge.yakinlik.startsWith("Annesi")) {
                edge.color = { color: "#ff8080" };
            }
        });

        nodes = nodes.sort(function (node1, node2) {
            if (node1.level != node2.level) {
                return node1.level - node2.level;
            }
            else {
                var yakinlikComps1 = node1.yakinlik.split(' ');
                var yakinlikComps2 = node2.yakinlik.split(' ');
                for (var i = 0; i < yakinlikComps1.length; i++) {
                    if (yakinlikComps1[i].startsWith("Annesi") && (yakinlikComps2[i].startsWith("Babası"))) {
                        return -1;
                    }
                    else if (yakinlikComps1[i].startsWith("Babası") && (yakinlikComps2[i].startsWith("Annesi"))) {
                        return 1;
                    }
                    else if (yakinlikComps1[i].startsWith("Kızı") && (yakinlikComps2[i].startsWith("Oğlu"))) {
                        return -1;
                    }
                    else if (yakinlikComps1[i].startsWith("Oğlu") && (yakinlikComps2[i].startsWith("Kızı"))) {
                        return 1;
                    }
                }

                return 0;
            }
        });

        var j = 0;
        var currentLevel = 0;
        var fatherGroupIndex = 0;
        var fatherGroupOffset = 0;
        var fatherGroupStart = 0;
        var motherLevels = [0];
        var fatherLevels = [0];

        for (var i = 0; i < nodes.length; i++) {
            if (currentLevel != nodes[i].level) {
                j = 0;
                currentLevel = nodes[i].level;
                motherLevels.push(0);
                fatherLevels.push(0);
            }
            if (nodes[i].group == "anne") {
                if (j * 150 > fatherGroupStart) {
                    fatherGroupStart = j * 150;
                }

                motherLevels[currentLevel]++;
            }
            else {
                fatherLevels[currentLevel]++;
            }

            j++;
        }

        fatherGroupStart += 200;
        currentLevel = 0;
        j = 0;
        for (var i = 0; i < nodes.length; i++) {
            if (currentLevel != nodes[i].level) {
                j = 0;
                fatherGroupIndex = 0;
                currentLevel = nodes[i].level;
            }
            nodes[i].x = j * 150;
            if (nodes[i].group == "baba") {
                if (fatherGroupIndex == 0) {
                    fatherGroupOffset = fatherGroupStart - (j * 150);
                }
                nodes[i].x = fatherGroupOffset + (j * 150);
                fatherGroupIndex++;
            }
            nodes[i].y = (nodes[i].level + 1) * 100;
            j++;
        }

        j = 0;
        currentLevel = 0;
        var maxMotherLevelLength = motherLevels.slice(0).sort(function (a, b) { return a - b })[motherLevels.length - 1];
        var maxFatherLevelLength = fatherLevels.slice(0).sort(function (a, b) { return a - b })[fatherLevels.length - 1];
        for (var i = 0; i < nodes.length; i++) {
            if (currentLevel != nodes[i].level) {
                j = 0;
                currentLevel = nodes[i].level;
            }
            if (nodes[i].group == "anne") {
                var levelLength = motherLevels[currentLevel];
                if (levelLength != maxMotherLevelLength) {
                    //adjust x
                    nodes[i].x += 150 * (maxMotherLevelLength - levelLength) / 2;
                }
            }
            else {
                var levelLength = fatherLevels[currentLevel];
                if (levelLength != maxFatherLevelLength) {
                    //adjust x
                    nodes[i].x += 150 * (maxFatherLevelLength - levelLength) / 2;
                }
            }
        }

        drawNetwork('family-network', nodes, edges, '500px');
        $("#family-network").show();
        $("#network-info").show();
        exportedNetwork = drawNetwork('export-container', nodes, edges, '1000px');
        $("#preloader").hide();
        window.scrollTo(0, $("#family-network").offset().top - 100);
    }

    function drawNetwork(element, nodes, edges, height) {
        var container = document.getElementById(element);
        var data = {
            nodes: nodes,
            edges: edges
        };

        var options = {
            width: '100%',
            height: height,
            interaction: {
                dragNodes: false,
            },
            nodes: {
                shape: 'box',
                size: 36,
                font: {
                    size: 14,
                    multi: 'md'
                },
                borderWidth: 0,
                widthConstraint: {
                    minimum: 100
                },
                heightConstraint: {
                    minimum: 36
                }
            },
            edges: {
                smooth: {
                    type: 'cubicBezier',
                    forceDirection: 'vertical',
                    roundness: 0.4
                }
            },
            groups: {
                anne: {
                    color: { background: '#ff8080' }
                },
            },
            physics: false,
        };
        var network = new vis.Network(container, data, options);
        setTimeout(function () {
            network.fit();
        }, 1000);
        return network;
    }

    function createNodesAndEdges(person, people, nodes, edges) {
        var targets = [];
        if (person.yakinlik.endsWith("Annesi") || person.yakinlik.endsWith("Babası")) {
            nodes.push({ id: person.id, label: createLabel(person.adi, person.dogumYeri, person.dogumTarihi, person.olumTarihi), level: person.yakinlik.split(' ').length, yakinlik: person.yakinlik });
            var postFix = "nin";
            if (person.yakinlik.endsWith("ı")) {
                postFix = "nın";
            }

            // Babasını bul ve bağ oluştur
            var targetRelation = person.yakinlik + postFix + " Babası";
            var father = findPersonByRelation(people, targetRelation);
            var fatherId = 0;
            if (father == null) {
                nodes.push({ id: targetRelation, label: createLabel(person.babaAdi), level: targetRelation.split(' ').length, yakinlik: targetRelation });
                edges.push({ from: targetRelation, to: person.id, yakinlik: targetRelation });
                fatherId = targetRelation;
            }
            else {
                edges.push({ from: father.id, to: person.id, yakinlik: targetRelation });
                fatherId = father.id;
            }

            // Annesini bul ve anne-baba arasında bağ oluştur
            targetRelation = person.yakinlik + postFix + " Annesi";
            var mother = findPersonByRelation(people, targetRelation);
            if (mother == null) {
                nodes.push({ id: targetRelation, label: createLabel(person.anaAdi), level: targetRelation.split(' ').length, yakinlik: targetRelation });
                edges.push({ from: targetRelation, to: fatherId, yakinlik: targetRelation });
            }
            else {
                edges.push({ from: mother.id, to: fatherId, yakinlik: targetRelation });
            }
        }
        else if (person.yakinlik == "Kendisi") {
            nodes.push({ id: person.id, label: createLabel(person.adi, person.dogumYeri, person.dogumTarihi, person.olumTarihi), level: 0, yakinlik: person.yakinlik });
            // Babasını bul ve bağ oluştur
            var targetRelation = "Babası";
            var father = findPersonByRelation(people, targetRelation);
            var fatherId = 0;
            if (father == null) {
                nodes.push({ id: targetRelation, label: createLabel(person.babaAdi), level: targetRelation.split(' ').length, yakinlik: targetRelation });
                edges.push({ from: targetRelation, to: person.id, yakinlik: targetRelation });
                fatherId = targetRelation;
            }
            else {
                edges.push({ from: father.id, to: person.id, yakinlik: targetRelation });
                fatherId = father.id;
            }

            // Annesini bul ve anne-baba arasında bağ oluştur
            targetRelation = "Annesi";
            var mother = findPersonByRelation(people, targetRelation);
            if (mother == null) {
                nodes.push({ id: targetRelation, label: createLabel(person.anaAdi), level: targetRelation.split(' ').length, yakinlik: targetRelation });
                edges.push({ from: targetRelation, to: fatherId, yakinlik: targetRelation });
            }
            else {
                edges.push({ from: mother.id, to: fatherId, yakinlik: targetRelation });
            }
        }
        else {
            nodes.push({ id: person.id, label: createLabel(person.adi, person.dogumYeri, person.dogumTarihi, person.olumTarihi), level: -1 * person.yakinlik.split(' ').length, yakinlik: person.yakinlik });

        }
    }

    function findPersonByRelation(people, relation) {
        return people.find(function (person) {
            return person.yakinlik == relation;
        })
    }

    function getPageText(pageNum, PDFDocumentInstance) {
        return new Promise(function (resolve, reject) {
            PDFDocumentInstance.getPage(pageNum).then(function (pdfPage) {
                pdfPage.getTextContent().then(function (textContent) {
                    var textItems = textContent.items;
                    resolve(textItems);
                });
            });
        });
    }

    function isNumeric(val) {
        return !isNaN(+val);
    }

    function isGender(val) {
        return val == "E" || val == "K";
    }

    function isRelationType(val) {
        return val.startsWith("Annesi") || val.startsWith("Babası") || val.startsWith("Kendisi") || val.startsWith("Oğlu") || val.startsWith("Kızı");
    }

    function isLifeStatus(val) {
        return val == "Ölüm" || val == "Sağ";
    }

    function isDate(val) {
        return val.split('/').length == 3;
    }

    function isMarriageStatus(val) {
        return val == "Evli" || val == "Dul" || val == "Bekâr" || val == "Bekar";
    }

    function isRegistryNumbers(val) {
        return val.split('-').length == 3;
    }

    function shouldIgnore(val) {
        return val == " ";
    }

    function isNewRow(i, textItems) {
        try {
            return isNumeric(textItems[i].str) && isGender(textItems[i + 1].str) && isRelationType(textItems[i + 2].str);
        }
        catch (err) {
            return false;
        }
    }

    function isEndOfRow(i, textItems) {
        return isLifeStatus(textItems[i - 1].str) && (isDate(textItems[i].str) || textItems[i].str == "-");
    }

    function createLabel(name, birthPlace, dateOfBirth, dateOfDeath) {
        var label = "*" + name + "*";
        if (!!birthPlace && birthPlace != "-") {
            label += "\n" + birthPlace + "";
        }
        if (!!dateOfBirth && dateOfBirth != "-") {
            var comps = dateOfBirth.split('/');
            label += "\n(" + comps[comps.length - 1];

            if (!!dateOfDeath && dateOfDeath != "-") {
                comps = dateOfDeath.split('/')
                label += "-" + comps[comps.length - 1];
            }

            label += ")";
        }

        return label;
    }
});