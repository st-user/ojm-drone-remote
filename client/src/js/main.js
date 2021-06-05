import MainSectionModel from './MainSectionModel.js';
import MainSectionView from './MainSectionView.js';
import StartAreaModel from './StartAreaModel.js';
import StartAreaView from './StartAreaView.js';
import ViewStateModel from './ViewStateModel.js';

export default function main() {

    const viewStateModel = new ViewStateModel();
    const startAreaModel = new StartAreaModel();
    const mainSectionModel = new MainSectionModel(viewStateModel, startAreaModel);

    const startAreaView = new StartAreaView(
        viewStateModel, startAreaModel, mainSectionModel
    );

    const mainSectionView = new MainSectionView(
        viewStateModel, startAreaModel, mainSectionModel
    );

    startAreaView.setUpEvent();
    mainSectionView.setUpEvent();
}
